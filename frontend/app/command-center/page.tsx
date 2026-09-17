'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * The panels all live inside the /transit shell, so /command-center?mint=…
 * is a thin entry point that hands the mint to that shell's tab.
 */
function CommandCenterRedirect() {
  const router = useRouter()
  const mint = useSearchParams().get('mint') ?? ''

  useEffect(() => {
    const q = mint ? `&mint=${encodeURIComponent(mint)}` : ''
    router.replace(`/transit?tab=command-center${q}`)
  }, [mint, router])

  return null
}

export default function CommandCenterPage() {
  return (
    <Suspense fallback={null}>
      <CommandCenterRedirect />
    </Suspense>
  )
}
