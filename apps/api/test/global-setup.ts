import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testDb = resolve(apiDir, 'prisma', 'test.db')

/**
 * Provision a fresh SQLite test database before the test run:
 * delete any previous test.db, then apply the committed migrations.
 * Runs once, before all test files (see vitest.config.ts).
 */
export default function globalSetup(): void {
  rmSync(testDb, { force: true })
  rmSync(`${testDb}-journal`, { force: true })

  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  })
}
