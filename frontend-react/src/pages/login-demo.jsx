/**
 * login-demo.jsx
 * - Landing page with two entry points: demo chat or full app login
 * - Equivalent of login.ejs
 */

// import react hooks
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startDemo } from '../services/auth'
import '../styles/login-app.css'

function LoginDemoPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // useNavigate lets us redirect 
  const navigate = useNavigate()

  /**
   * handleDemo — calls /api/start to create a guest session + temp room,
   * then navigates directly into that chatroom.
   */
  async function handleDemo() {
    setError('')
    setLoading(true)

    try {
      // startDemo() returns the room object { _id, name, image }
      const room = await startDemo()

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
          {/* Enter Demo — creates a guest session and drops user into a chatroom. */}
          <button onClick={handleDemo} disabled={loading}>
            {loading ? 'Loading...' : 'Enter Demo'}
          </button>

          {/* Enter App — navigates to the login/signup page. */}
          <button onClick={() => navigate('/login')} disabled={loading}>
            Enter App
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoginDemoPage
