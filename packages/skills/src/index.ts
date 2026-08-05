/**
 * @repo/skills — the integration skill engine package.
 *
 * Public surface for the API layer (apps/api) and the frontend skill-runner:
 *  - types:        SkillPackage, SkillLifecycle, SkillManifest, Connector, AuditSink, ...
 *  - loader:       loadSkillFromDir / loadSkillsFromDir / validateManifest
 *  - registry:     SkillRegistry + createDefaultSkillRegistry
 *  - engine:       SkillEngine + createEngine (orchestrates + audits the loop)
 *  - audit:        InMemoryAuditSink (reference append-only sink)
 *  - credentials:  opaque credential-ref vault (secrets never leaked)
 *  - connectors:   generic Connector interface + simulated Slack + Buzz STUB
 *  - demo:         runDemo() — full deploy->...->handoff drill (used by tests)
 */

export * from './types.js'
export * from './audit.js'
export * from './credentials.js'
export * from './loader.js'
export * from './registry.js'
export * from './engine.js'
export * from './connectors/index.js'
export { runDemo } from './demo/run-demo.js'
