/**
 * services/auth.js
 * 
 * - Implements:
 * - API calls related to authentication
 * - Keep API logic separate from UI component
 * - Components (login-app.jsx) handles UI + state
 * - Services (/services/auth.js) handles data fetching
 */


/**
 * Sends a POST /api/login request 
 * 
 * @param {string} username
 * @param {string} password
 * 
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
 * @param {string} username
 * @param {string} password
 * 
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
 * @return {Object} room - created room object, contains room_.id for navigation
 */
export async function startDemo() {
  const res = await fetch('/api/start', {
  headers: {'Accept' : 'application/json'}
  })

  if (!res.ok) throw new Error('Failed to create a demo room')
  return res.json() // returns the room object { _id, name, image }
}


/** 
 * Sends a /GET /api/profile 
 * @return {Object} {username}
 */
export async function getProfile(){
  const res = await fetch ('/api/profile')
  if (!res.ok) throw new Error ('Failed to get profile')
  return res.json()
}


/**
 * Sends a /PUT /api/profile
 * after a successful update, express clears the session
 * user must login again
 * 
 * @param {Object} payload either {username: 'newName'} or {password: 'newPassword'} 
 */
export async function updateProfile(payload){
  const res = await fetch ('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) throw new Error (data.message || 'Failed to Update Profile')
  return data
}