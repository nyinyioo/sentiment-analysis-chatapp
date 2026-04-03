/**
 * hooks/useWebSocket.js
 * - custom hook to manage a WebSocket connection for a chat room.
 * - implements websocket logic used in chatroom.jsx.
 */
import { useEffect, useRef } from 'react'


/**
 * Custom hook to manage WebSocket connection for a chat room.
 *
 * @param {string} roomId 
 * @param {(message: any) => void} onMessage  // callback when msg in recieved
 * @returns {{ sendMessage: Function }}       // func to send messages through ws
 */
function useWebSocket(roomId, onMessage) {

  // holds ws instance (persists across renders)
  const socketRef = useRef(null)

  // holds latest onMessage callback
  const onMessageRef = useRef(onMessage)

  // update ref whenever onMessage changes
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    // ws protocol
    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'

    // create a ws connection to backend
    const socket = new WebSocket(`${wsProto}//${location.host}/ws`)
    socketRef.current = socket

    // logging if ws connected
    socket.onopen = () => {
      console.log('[WS] Connected to room:', roomId)
    }

    // message received from server
    socket.onmessage = (event) => {
      try {
        // parse JSON payload
        const message = JSON.parse(event.data)

        // forward message 
        onMessageRef.current(message)
      } catch (err) {
        console.error('[WS] Failed to parse message:', err)
      }
    }

    // WebSocket error handler
    socket.onerror = (err) => {
      console.error('[WS] Error:', err)
    }

    // cleanup when ws close
    return () => {
      socket.close()
      console.log('[WS] Disconnected from room:', roomId)
    }

  }, [roomId]) // reconnect whenever room changes


  /**
   * Sends a message to the server over the WebSocket.
   * The server expects: { roomId, text }
   * Express will add sentiment and 
   * broadcast to all clients in the room.
   */
  function sendMessage(text) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ roomId, text }))
    }
  }
  return { sendMessage }
}

export default useWebSocket
