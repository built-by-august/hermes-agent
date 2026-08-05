/**
 * Credential vault (MVP, in-memory).
 *
 * Secrets never appear in phase outputs or audit contexts: `wire` stores the
 * secret and exposes only an opaque `enc:v1:` reference. Production replaces
 * this map with envelope encryption at rest + a secret-manager boundary
 * (architecture §9); the API surface is unchanged because only refs are ever
 * returned.
 */

const vault = new Map<string, string>()

export const CREDENTIAL_REF_PREFIX = 'enc:v1:'

function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

/** Store a secret; returns the opaque reference. The secret is not returned. */
export function storeCredential(secret: string): string {
  const ref = `${CREDENTIAL_REF_PREFIX}${randomId()}`
  vault.set(ref, secret)
  return ref
}

/** Read a secret by reference (server-side only). */
export function readCredential(ref: string): string | undefined {
  return vault.get(ref)
}

export function isCredentialRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(CREDENTIAL_REF_PREFIX)
}

/** True when the given value is a ref, not the secret itself. */
export function assertRefOnly(value: unknown): void {
  if (typeof value === 'string' && !isCredentialRef(value)) {
    throw new Error('credential material leaked outside the vault: refusing to expose secret')
  }
}

/** Clear all stored credentials (test isolation). */
export function clearVault(): void {
  vault.clear()
}
