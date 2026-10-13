// Premium/license system was removed. This page is kept as a redirect stub.
// The route in App.tsx already redirects /premium → /keys, but this
// file still needs to exist for any lingering imports.
import { Navigate } from 'react-router-dom'

export default function PremiumPage() {
  return <Navigate to="/keys" replace />
}
