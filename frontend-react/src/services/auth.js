/**
 * services/auth.js
 * - Implements API calls related to authentication
 * - Keep API logic separate from UI component
 *   Components (login-app.jsx) handles UI + state
 *   Services (/services/auth.js) handles data fetching
 */


/**
 * Sends a POST /api/login request 
 * 
 * Vite proxy rewrites:
 *   - /api/login to /login to match Express 

 * @param {string} username
 * @param {string} password
 * @returns {Object} { ok: true } on success, throws an error string on failure
 */
export async function login(username, password) {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const data = await res.json()

  if (!res.ok) throw new Error(data.error || 'Login failed')

  return data
}

/**
 * Sends a POST /api/signup request 
 * 
 * Vite proxy rewrites:
 *   - /api/signup to /signup to match Express 
 *
 * @param {string} username
 * @param {string} password
 * @returns {Object} { ok: true } on success, throws an error string on failure
 */
export async function signup(username, password) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const data = await res.json()

  if (!res.ok) throw new Error(data.error || 'Signup failed')

  return data
}


/**
 * Sends a /GET /api/start request 
 * - create a temp guest session and room
 * 
 * Vite proxy rewrites:
 *   - /api/start to /start to match Express
 * @return {Object} room - created room object, contains room_.id for navigation
 */

export async function startDemo() {
  const res = await fetch('/api/start', {
  headers: {'Accept' : 'application/json'}
  })

  if (!res.ok) throw new Error('Failed to create a demo room')
  return res.json() // returns the room object { _id, name, image }
}
