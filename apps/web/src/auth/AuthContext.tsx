import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Membership, User } from '@repo/contracts'

import { getApiClient, tokenStore } from '../lib/api'
import { DEMO_ORG_ID } from '../lib/api/seed'

interface AuthState {
  user: User | null
  memberships: Membership[]
  token: string | null
  orgId: string
  /** mock adapter = demo mode, no real backend required */
  demo: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = getApiClient()
  const demo = import.meta.env.VITE_API_MODE !== 'http'

  const [token, setToken] = useState<string | null>(() => tokenStore.get())
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const me = await api.me(token)
        if (!active) return
        setUser(me.user)
        setMemberships(me.memberships)
      } catch {
        tokenStore.clear()
        setToken(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [api, token])

  const value = useMemo<AuthState>(
    () => ({
      user,
      memberships,
      token,
      orgId: DEMO_ORG_ID,
      demo,
      loading,
      async login(email, password) {
        const res = await api.login({ email, password })
        tokenStore.set(res.accessToken)
        setToken(res.accessToken)
        setUser(res.user)
        const me = await api.me(res.accessToken)
        setMemberships(me.memberships)
      },
      async register(name, email, password) {
        const res = await api.register({ name, email, password })
        tokenStore.set(res.accessToken)
        setToken(res.accessToken)
        setUser(res.user)
        const me = await api.me(res.accessToken)
        setMemberships(me.memberships)
      },
      logout() {
        tokenStore.clear()
        setToken(null)
        setUser(null)
        setMemberships([])
      },
    }),
    [user, memberships, token, demo, loading, api]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
