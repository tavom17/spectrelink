async function safeParse<T>(res: Response): Promise<T> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text as unknown as T }
}

export async function apiFetch<T = unknown>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
    credentials: 'include',
  })
  const data = await safeParse<T & { error?: string }>(res)
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Server error (${res.status})`
    throw new Error(msg)
  }
  return data
}
