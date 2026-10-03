'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

/**
 * No landing page: the app opens on the login screen. A visitor whose session
 * the auth provider already restored goes straight into the app.
 */
export default function Home() {
  const router = useRouter()
  const { loading, accessToken } = useAuth()

  useEffect(() => {
    if (loading) return
    router.replace(accessToken ? '/transit' : '/login')
  }, [loading, accessToken, router])

  return null
}
