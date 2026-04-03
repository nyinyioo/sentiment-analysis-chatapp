/**
 * login-demo.jsx
 * - Landing page with two entry points: demo chat or full app login
 * - Equivalent of login.ejs
 */

// import react hooks and API calls
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startDemo, getProfile } from '../services/auth'
import { useAuth } from '../context/AuthContext'
import '../styles/login-app.css'

function LoginDemoPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // useNavigate - redirect
  const navigate = useNavigate()
  const { login } = useAuth()

  /**
   * handleDemo — calls /api/start to create a guest session + temp room,
   * then navigates directly into that chatroom.
   */
  async function handleDemo() {
    setError('')
    setLoading(true)

    try {
      // startDemo() returns the room object { _id, name, image }
      // It also sets a guest session cookie on the server
      const room = await startDemo()

      // get the guest username from the new session 
      // otherwise ProtectedRoute wil see username=null and redirect to /login.
      const profile = await getProfile()
      login(profile.username)

      // Navigate to the chatroom using the room's _id as the URL parameter.
      // This maps to the Route: /chat/:roomId in App.jsx
      navigate(`/chat/${room._id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-body">
      <div className="login-container">
        <h2>CHATAPP</h2>
        {/* Only renders when there's an error */}
        {error && <div className="error-message">{error}</div>}

        <div className="button-group">
          {/* Enter Demo  creates a guest session and drops user into a chatroom. */}
          <button onClick={handleDemo} disabled={loading}>
            {loading ? 'Loading...' : 'Enter Demo'}
          </button>

          {/* Enter App  navigates to the login/signup page. */}
          <button onClick={() => navigate('/login')} disabled={loading}>
            Enter App
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginDemoPage
