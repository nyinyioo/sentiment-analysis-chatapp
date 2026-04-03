/**
 * context/AuthContext.jsx
 * - provides global auth state for the entire app
 * - any component can call useAuth() to get the logged in username
 */

import { createContext, useContext, useState, useEffect } from 'react'
import { getProfile } from '../services/auth'

// createContext() hook: creates the shared space that components can read from.
const AuthContext = createContext(null)

/**
 * AuthProvider 
 * checks /api/profile on start to see if a session cookie exists.
 * Sets username if authenticated, null if not.
 */
export function AuthProvider({ children }) {
  const [username, setUsername] = useState(null)

  // loading: true while we're waiting for the profile check.
  // Prevents redirecting before we know auth state.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getProfile()
      .then(data => setUsername(data.username))
      .catch(() => setUsername(null))   // no session -> not logged in
      .finally(() => setLoading(false)) // always stop loading when done
  }, [])

  // update global auth state after a successful login
  function login(name) {
    setUsername(name)
  }

  // clear global auth state when logout
  function logout() {
    setUsername(null)
  }

  return (
    // value is what all child components receive when they call useAuth()
    <AuthContext.Provider value={{ username, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth — custom hook to read auth state from any component.
 * const { username, login, logout } = useAuth()
 */
export function useAuth() {
  return useContext(AuthContext)
}
