'use client'

import { useId } from 'react'

/** The floating staff and the swept "Arcana" wordmark from the design header. */
export default function ArcanaMark() {
  const id = useId().replace(/:/g, '')
  const wood = `arcWood${id}`
  const orb = `arcOrb${id}`

  return (
    <div className="brand" aria-label="Arcana">
      <div className="brand-staff" aria-hidden>
        <svg viewBox="0 0 26 40" width="36" height="56">
          <defs>
            <linearGradient id={wood} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7a6248" />
              <stop offset="45%" stopColor="#4e3f2e" />
              <stop offset="100%" stopColor="#2d251b" />
            </linearGradient>
            <radialGradient id={orb} cx="42%" cy="34%" r="70%">
              <stop offset="0%" stopColor="#f5f4ff" />
              <stop offset="42%" stopColor="#cfc7ff" />
              <stop offset="100%" stopColor="#6d5fb8" />
            </radialGradient>
          </defs>
          <path d="M14.2 11.5 C12.4 18 12 26 12.6 38" stroke={`url(#${wood})`} strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M13.3 20.2 C15.6 21.1 16.2 22.6 15.4 24.1" stroke="#6b563e" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M14.6 11.8 C10.6 9.6 10.2 5.4 13 3.6 C16.2 1.6 20.4 3.6 20.2 7.2" stroke={`url(#${wood})`} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          <circle cx="19.6" cy="8.4" r="3.5" fill={`url(#${orb})`} style={{ animation: 'omOrbPulse 6.4s ease-in-out infinite' }} />
          <circle cx="19.6" cy="8.4" r="6.4" fill="none" stroke="rgba(181,171,252,.45)" strokeWidth=".8" style={{ transformOrigin: '19.6px 8.4px', animation: 'omOrbRing 6.4s ease-out infinite' }} />
        </svg>
        <div className="brand-flare" />
      </div>
      <div className="brand-word">
        <div className="brand-ring brand-ring-a" aria-hidden />
        <div className="brand-ring brand-ring-b" aria-hidden />
        <span className="brand-text">Arcana</span>
      </div>
    </div>
  )
}
