/**
 * utils/avatar.js
 * - Deterministic avatar colour + initial for a username.
 * - Same name always gets the same colour across sessions.
 */

export const AVATAR_COLORS = [
  '#9B7FD4', // purple
  '#4F8FBF', // blue
  '#5FB39A', // teal
  '#D48A5F', // orange
  '#C96C8A', // rose
  '#7FA65F', // olive
]

// getAvatarColor for a given username.
export function getAvatarColor(name) {
  const str = String(name || '')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// Get the initial character of a username, upper-cased ("?" if empty).
export function getInitial(name) {
  const str = String(name || '').trim()
  return str ? str[0].toUpperCase() : '?'
}
