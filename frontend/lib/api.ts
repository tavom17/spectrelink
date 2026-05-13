'use client'

import { useAuth } from './auth'

async function safeParse<T>(res: Response): Promise<T> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text as unknown as T }
}

export function useApiFetch() {
  const { accessToken, refresh, logout } = useAuth()

  async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
      credentials: 'include',
    })

    if (res.status === 401) {
      let newToken: string
      try {
        newToken = await refresh()
      } catch {
        logout()
        throw new Error('Session expired. Please log in again.')
      }

      const retryRes = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
          ...options.headers,
        },
        credentials: 'include',
      })
      const retryData = await safeParse<T & { error?: string }>(retryRes)
      if (!retryRes.ok) throw new Error((retryData as { error?: string }).error ?? `Server error (${retryRes.status})`)
      return retryData
    }

    const data = await safeParse<T & { error?: string }>(res)
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `Server error (${res.status})`)
    return data
  }

  return { apiFetch }
}
