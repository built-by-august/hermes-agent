/**
 * Skill registry — holds the set of skills available to an org.
 *
 * The default registry ships the bundled sample skill (slack-incident-alert).
 * Additional packages can be registered programmatically or loaded from a
 * directory via `loadSkillsFromDir` (see loader.ts).
 */

import type { SkillPackage } from './types.js'
import { slackIncidentAlert } from './skills/slack-incident-alert/index.js'

export class SkillRegistry {
  private skills = new Map<string, SkillPackage>()

  register(pkg: SkillPackage): void {
    if (this.skills.has(pkg.manifest.slug)) {
      throw new Error(`skill "${pkg.manifest.slug}" already registered`)
    }
    this.skills.set(pkg.manifest.slug, pkg)
  }

  registerMany(pkgs: SkillPackage[]): void {
    for (const pkg of pkgs) this.register(pkg)
  }

  get(slug: string): SkillPackage | undefined {
    return this.skills.get(slug)
  }

  /** All registered skills, newest first. */
  list(): SkillPackage[] {
    return [...this.skills.values()].reverse()
  }

  /** Only fully-implemented skills (stubs like Buzz are excluded). */
  listImplemented(): SkillPackage[] {
    return this.list().filter((p) => p.manifest.implemented !== false)
  }

  has(slug: string): boolean {
    return this.skills.has(slug)
  }
}

/** A registry pre-loaded with the skills bundled in this package. */
export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry()
  registry.register(slackIncidentAlert())
  return registry
}
