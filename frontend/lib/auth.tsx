'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface User {
  user_id: string
  user_email: string
}

interface AuthState {
  accessToken: string | null
  user: User | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, secret: string) => Promise<{ seedPhrase: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseJwt(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { user_id: payload.user_id, user_email: payload.user_email }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ accessToken: null, user: null, loading: true })

  useEffect(() => {
    fetch('/api/auth/refreshToken', { method: 'POST', credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.accessToken) {
          setState({ accessToken: data.accessToken, user: parseJwt(data.accessToken), loading: false })
        } else {
          setState({ accessToken: null, user: null, loading: false })
        }
      })
      .catch(() => setState({ accessToken: null, user: null, loading: false }))
  }, [])

  async function login(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_email: email, password }),
    })
    const text = await res.text()
    let data: { error?: string; accessToken?: string } = {}
    try { data = JSON.parse(text) } catch { /* non-JSON response */ }
    if (!res.ok) throw new Error(data.error ?? `Server error (${res.status})`)
    setState({ accessToken: data.accessToken!, user: parseJwt(data.accessToken!), loading: false })
  }

  async function register(email: string, password: string, secret: string) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: email, user_pass: password, registration_secret: secret }),
    })
    const text = await res.text()
    let data: { error?: string; message?: string; seedPhrase?: string } = {}
    try { data = JSON.parse(text) } catch { /* non-JSON response */ }
    if (!res.ok) throw new Error(data.error ?? data.message ?? `Server error (${res.status})`)
    return { seedPhrase: data.seedPhrase as string }
  }

  function logout() {
    setState({ accessToken: null, user: null, loading: false })
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
