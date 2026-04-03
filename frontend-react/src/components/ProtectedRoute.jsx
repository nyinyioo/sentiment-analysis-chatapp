/**
 * components/ProtectedRoute.jsx
 * - wraps any route that requires authentication.
 * - If not logged in, redirects to /login.
 * - If still checking auth, renders nothing.
 * - If authenticated, renders the page normally.
 *
 * Usage in App.jsx:
 *   <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
 */

import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { username, loading } = useAuth()

  // Still checking session, wait for the result
  if (loading) return null

  // Redirect to login if no session found
  if (!username) return <Navigate to="/login" replace />

  // if authenticated render the page
  return children
}

export default ProtectedRoute
