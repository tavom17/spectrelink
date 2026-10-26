'use client'

import { useAuth } from './auth'

/** Thrown for any non-2xx response. `status` lets callers branch (400 / 404 / 409 …). */
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function safeParse<T>(res: Response): Promise<T> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text as unknown as T }
}

/** The fetcher returned by useApiFetch, for helpers outside components that need it passed in. */
export type ApiFetch = ReturnType<typeof useApiFetch>['apiFetch']

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
        throw new ApiError('Session expired. Please log in again.', 401)
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
      if (!retryRes.ok) throw new ApiError((retryData as { error?: string }).error ?? `Server error (${retryRes.status})`, retryRes.status)
      return retryData
    }

    const data = await safeParse<T & { error?: string }>(res)
    if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Server error (${res.status})`, res.status)
    return data
  }

  return { apiFetch }
}
