/**
 * Skill package loader — validates the package format (skill.json manifest +
 * entry module) and loads skills from a directory or tarball.
 *
 * Package format (architecture §6.1):
 *
 *   skills/<slug>/
 *     skill.json          # manifest (validated against SkillManifest)
 *     index.(js|ts)       # default export: implements the SkillLifecycle
 *     schema.ts           # Zod: input/output/step schemas (author-side)
 *     checks.ts           # verification checks (author-side)
 *     assets/             # docs, templates
 *
 * The manifest is validated with Zod at load time; a malformed package is
 * rejected loudly instead of failing mid-run.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

import type { SkillCapabilities, SkillLifecycle, SkillManifest, SkillPackage } from './types.js'

/* Zod schema for skill.json — the package-format contract. */
const capabilitiesSchema = z
  .object({
    connectors: z.array(z.string()).default([]),
    risk: z.enum(['low', 'medium', 'high']).default('low'),
  })
  .passthrough()

export const skillManifestSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().default(''),
  phases: z
    .array(z.enum(['suggest', 'implement', 'wire', 'verify', 'handoff']))
    .default(['suggest', 'implement', 'wire', 'verify', 'handoff']),
  capabilities: capabilitiesSchema.default({
    connectors: [],
    risk: 'low',
  } satisfies SkillCapabilities),
  entry: z.string().min(1).default('index.ts'),
  implemented: z.boolean().default(true),
  remainingWork: z.array(z.string()).default([]),
})

export function validateManifest(raw: unknown): SkillManifest {
  return skillManifestSchema.parse(raw)
}

export interface LoadSkillFromDirOptions {
  /** Skip the entry-module import (manifest-only load). */
  manifestOnly?: boolean
}

/**
 * Load a skill package from a directory containing skill.json.
 * The entry module must default-export a SkillLifecycle.
 */
export async function loadSkillFromDir(
  dir: string,
  options: LoadSkillFromDirOptions = {}
): Promise<SkillPackage> {
  const manifestPath = path.join(dir, 'skill.json')
  let raw: unknown
  try {
    raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch (err) {
    throw new Error(`skill package ${dir}: cannot read skill.json: ${String(err)}`)
  }

  const manifest = validateManifest(raw)
  if (options.manifestOnly) {
    return { manifest, lifecycle: missingLifecycle(manifest.slug) }
  }

  const entryPath = path.resolve(dir, manifest.entry)
  let mod: unknown
  try {
    mod = await import(entryPath)
  } catch (err) {
    throw new Error(
      `skill package ${manifest.slug}: failed to import entry "${manifest.entry}": ${String(err)}`
    )
  }

  const lifecycle = (mod as { default?: SkillLifecycle }).default
  if (!lifecycle) {
    throw new Error(
      `skill package ${manifest.slug}: entry "${manifest.entry}" must default-export a SkillLifecycle`
    )
  }
  for (const phase of manifest.phases) {
    if (typeof (lifecycle as unknown as Record<string, unknown>)[phase] !== 'function') {
      throw new Error(`skill package ${manifest.slug}: lifecycle missing phase "${phase}"`)
    }
  }

  return { manifest, lifecycle }
}

/** Load every skill package under a parent directory (one subdir per skill). */
export async function loadSkillsFromDir(
  parentDir: string,
  options: LoadSkillFromDirOptions = {}
): Promise<SkillPackage[]> {
  const entries = await fs.readdir(parentDir, { withFileTypes: true })
  const packages: SkillPackage[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    try {
      packages.push(await loadSkillFromDir(path.join(parentDir, entry.name), options))
    } catch (err) {
      // Skip dirs that are not skill packages, but surface real errors clearly.
      if (err instanceof Error && err.message.includes('skill.json')) continue
      throw err
    }
  }
  return packages
}

function missingLifecycle(slug: string): SkillLifecycle {
  return {
    suggest: () => {
      throw new Error(`skill ${slug}: lifecycle not loaded (manifest-only)`)
    },
    implement: () => {
      throw new Error(`skill ${slug}: lifecycle not loaded (manifest-only)`)
    },
    wire: () => {
      throw new Error(`skill ${slug}: lifecycle not loaded (manifest-only)`)
    },
    verify: () => {
      throw new Error(`skill ${slug}: lifecycle not loaded (manifest-only)`)
    },
    handoff: () => {
      throw new Error(`skill ${slug}: lifecycle not loaded (manifest-only)`)
    },
  }
}
