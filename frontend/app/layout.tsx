import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import Cursor from '@/components/Cursor'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'SpectreLink',
  description: 'Solana Off-Chain Orchestration Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Cursor />
          <Nav />
          <main className="pt-[72px]">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
