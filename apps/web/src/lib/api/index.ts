import type { ApiClient } from './types'
import { MockApiClient } from './mock'
import { HttpApiClient } from './http'

const TOKEN_KEY = 'hermes.accessToken'

/** Persistent token store (localStorage; documented MVP tradeoff per architecture §9). */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* ignore (private mode / SSR) */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

let client: ApiClient | null = null

/**
 * Returns the configured API adapter.
 *
 *  - Default: `MockApiClient` (in-memory demo data) — frontend works in parallel.
 *  - `VITE_API_MODE=http`: `HttpApiClient` against `VITE_API_URL` (default /api/v1).
 */
export function getApiClient(): ApiClient {
  if (client) return client

  const mode = import.meta.env.VITE_API_MODE ?? 'mock'
  if (mode === 'http') {
    const base = import.meta.env.VITE_API_URL ?? '/api/v1'
    client = new HttpApiClient(base, () => tokenStore.get())
  } else {
    client = new MockApiClient()
  }
  return client
}

export { MockApiClient, HttpApiClient }
export type { ApiClient }
