/**
 * Loader tests — validate the skill package format (skill.json manifest) and
 * directory loading. Uses the bundled slack-incident-alert directory as a real
 * fixture so we exercise loadSkillFromDir against an actual on-disk package.
 */

import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadSkillFromDir,
  loadSkillsFromDir,
  validateManifest,
  skillManifestSchema,
} from '../loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/tests -> ../skills
const skillsDir = path.resolve(__dirname, '../skills')

describe('skill package loader', () => {
  it('loads the bundled slack-incident-alert package from disk', async () => {
    const pkg = await loadSkillFromDir(path.join(skillsDir, 'slack-incident-alert'))
    expect(pkg.manifest.slug).toBe('slack-incident-alert')
    expect(pkg.manifest.implemented).toBe(true)
    expect(typeof pkg.lifecycle.suggest).toBe('function')
    expect(typeof pkg.lifecycle.handoff).toBe('function')
  })

  it('manifest-only load skips the entry import', async () => {
    const pkg = await loadSkillFromDir(path.join(skillsDir, 'slack-incident-alert'), {
      manifestOnly: true,
    })
    expect(pkg.manifest.slug).toBe('slack-incident-alert')
  })

  it('loads all packages under a directory', async () => {
    const pkgs = await loadSkillsFromDir(skillsDir, { manifestOnly: true })
    const slugs = pkgs.map((p) => p.manifest.slug)
    expect(slugs).toContain('slack-incident-alert')
  })

  it('rejects a malformed manifest', () => {
    expect(() => validateManifest({ slug: 123 })).toThrow()
  })

  it('defaults implemented=true and remainingWork=[]', () => {
    const m = skillManifestSchema.parse({ slug: 'x', name: 'X', version: '1.0.0' })
    expect(m.implemented).toBe(true)
    expect(m.remainingWork).toEqual([])
    expect(m.phases).toEqual(['suggest', 'implement', 'wire', 'verify', 'handoff'])
  })
})
