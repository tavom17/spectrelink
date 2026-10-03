'use client'

import { useEffect } from 'react'

/**
 * One document-level pointer listener that feeds the `.glow` highlight.
 * Every `.glow` element under the pointer (a card, and the row inside it) gets
 * --mx / --my relative to itself; elements the pointer has left are reset.
 */
export default function GlowTracker() {
  useEffect(() => {
    let active: HTMLElement[] = []

    function reset(el: HTMLElement) {
      el.style.removeProperty('--mx')
      el.style.removeProperty('--my')
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType === 'touch') return
      const chain: HTMLElement[] = []
      let el = e.target instanceof Element ? e.target.closest<HTMLElement>('.glow') : null
      while (el) {
        chain.push(el)
        el = el.parentElement?.closest<HTMLElement>('.glow') ?? null
      }
      for (const a of active) if (!chain.includes(a)) reset(a)
      for (const c of chain) {
        const r = c.getBoundingClientRect()
        c.style.setProperty('--mx', `${e.clientX - r.left}px`)
        c.style.setProperty('--my', `${e.clientY - r.top}px`)
      }
      active = chain
    }

    function onLeave() {
      active.forEach(reset)
      active = []
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return null
}
