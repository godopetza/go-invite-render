import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'go-invite-render — Card Editor',
  description: 'Visual editor for go-invite-render invitation cards',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
