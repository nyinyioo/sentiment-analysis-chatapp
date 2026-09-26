/**
 * chatroom.jsx
 * - Real-time chat interface with sentiment analysis
 * - Displays room avatar, room name, and participant list
 * - Each participant has a unique avatar and initial
 */

// import react hooks and api calls
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import useWebSocket from '../hooks/useWebSocket'
import { getMessages, deleteDemoMessages, getRooms } from '../services/rooms'
import { useAuth } from '../context/AuthContext'

// import sentiment analysis utilities 
import { getEmotion, EMOTIONS, EMOTION_ORDER } from '../utils/sentiment'
import { getAvatarColor, getInitial } from '../utils/avatar'
import '../styles/chatroom.css'


const SCROLL_THRESHOLD = 80

// determines the sender of a message
// falls back to the logged in user if no username
function senderOf(msg, me) {
  return msg.isBot ? (msg.username || 'bot') : (msg.username || me)
}

// check if message is sent by the logged in user
function isMine(msg, me) {
  return !msg.isBot && senderOf(msg, me) === me
}

// bot greeting shown at the top of every room
const GREETING = {
  username: 'bot',
  text: 'How are you doing today?',
  isBot: true,
  sentiment: { label: 'LABEL_2', score: 0.8 },
}

function ChatroomPage() {

  // read roomId from /chat/:roomId
  const { roomId } = useParams()
  const navigate = useNavigate()

  // get username (auth) from global auth state
  const { username } = useAuth()

  // A room is a demo room if its ID starts with 'temp_'
  const isDemo = roomId.startsWith('temp_')

  // chat room state
  // initialize with bot message
  const [messages, setMessages] = useState([GREETING])
  const [inputText, setInputText] = useState('')
  const [roomName, setRoomName] = useState(isDemo ? 'Demo Chat' : '')

  // menu and legend state
  const [menuOpen, setMenuOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)

  // true when the user has scrolled up and new messages may be hidden
  const [showScrollButton, setShowScrollButton] = useState(false)

  // useRef gives us direct access to the
  // message list DOM node for scrolling
  const messageListRef = useRef(null)

  // loads the room name
  useEffect(() => {
    if (isDemo) return
    getRooms()
      .then(rooms => {
        const room = rooms.find(r => String(r._id) === roomId)
        if (room) setRoomName(room.name)
      })
      .catch(() => setRoomName(roomId))
  }, [roomId, isDemo])


  /**
   * loads message history
   * demo rooms: no memory
   * app rooms: persistant memory
   */
  useEffect(() => {
    if (isDemo) return

    // React StrictMode runs effects twice in dev. `cancelled` drops the
    // stale first result, and we REPLACE the list (greeting + history)
    // rather than append, so history can never be shown twice.
    let cancelled = false
    getMessages(roomId)
      .then(conversation => {
        if (cancelled || !conversation?.messages) return
        setMessages([GREETING, ...conversation.messages])
      })
      .catch(err => console.error('[Chatroom] Failed to load history:', err))

    return () => { cancelled = true }
  }, [roomId, isDemo])


  // scroll the list to the newest message
  const scrollToBottom = useCallback(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [])

  // implement auto scroll - every time message change
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // show the "jump to bottom" button when scrolled away from the bottom
  function handleScroll() {
    const list = messageListRef.current
    if (!list) return
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight
    setShowScrollButton(distance > SCROLL_THRESHOLD)
  }


  /**
   * websocket message handler
   * useCallback: react hook that caches
   * a function definition between renders
   */
  const handleMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const { sendMessage } = useWebSocket(roomId, handleMessage)

  // handle send messages
  function handleSend() {
    const text = inputText.trim()
    if (!text) return
    sendMessage(text)
    setInputText('')
  }

  // shift+enter new line
  // enter to send
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // exit
  async function handleExit() {
    if (isDemo) {
      try { await deleteDemoMessages() } catch { /* demo cleanup is best-effort */ }
      navigate('/')
    } else {
      navigate('/lobby')
    }
  }

  // get the list of participants in the chat room
  const participants = useMemo(() => {
    const others = []
    for (const msg of messages) {
      const name = senderOf(msg, username)
      if (name !== username && !others.includes(name)) others.push(name)
    }
    return [...others, 'You'].join(', ')
  }, [messages, username])


  // render
  return (
    <div className="chat-container">

      {/* Header */}
      <header className="chat-header">
        <div className="room-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8" r="3" />
            <circle cx="16.5" cy="9" r="2.5" />
            <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
            <path d="M15.5 14.5c2.8 0 5.5 1.6 5.5 4.5" />
          </svg>
        </div>

        <div className="room-info">
          <h1 className="room-name">{roomName}</h1>
          <div className="room-participants">{participants}</div>
        </div>

        <div className="room-menu">
          <button
            type="button"
            className="menu-button"
            aria-label="Room options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(open => !open)}
          >
            &middot;&middot;&middot;
          </button>

          {menuOpen && (
            <div className="menu-dropdown" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setLegendOpen(open => !open); setMenuOpen(false) }}
              >
                {legendOpen ? 'Hide colour guide' : 'Colour guide'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu-exit"
                onClick={handleExit}
              >
                Exit room
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Colour legend: "Every message has a feeling." */}
      {legendOpen && (
        <div className="emotion-legend">
          <div className="legend-title">Every message has a feeling.</div>
          <div className="legend-grid">
            {EMOTION_ORDER.map(key => {
              const emotion = EMOTIONS[key]
              return (
                <div
                  key={key}
                  className="legend-chip"
                  style={{ backgroundColor: emotion.background, color: emotion.text }}
                >
                  {emotion.label}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Message List */}
      <div className="message-list-wrapper">
        <div className="message-list" ref={messageListRef} onScroll={handleScroll}>
          {messages.map((msg, index) => {
            const mine = isMine(msg, username)
            const sender = senderOf(msg, username)
            const emotion = getEmotion(msg.sentiment, msg.text)

            return (
              <div
                key={index}
                className={`message-row ${mine ? 'mine' : 'theirs'}`}
                data-emotion={emotion.key}
              >
                {!mine && (
                  <div className="message-sender">
                    <span
                      className="sender-avatar"
                      style={{ backgroundColor: getAvatarColor(sender) }}
                      aria-hidden="true"
                    >
                      {getInitial(sender)}
                    </span>
                    <span className="sender-name">{sender}</span>
                  </div>
                )}

                <div
                  className="message-bubble"
                  style={{ backgroundColor: emotion.background, color: emotion.text }}
                  title={emotion.label}
                  dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }}
                />

                {mine && <div className="message-you">You</div>}
              </div>
            )
          })}
        </div>

        {showScrollButton && (
          <button
            type="button"
            className="scroll-bottom-button"
            aria-label="Scroll to latest message"
            onClick={scrollToBottom}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4v16" />
              <path d="M5 13l7 7 7-7" />
            </svg>
          </button>
        )}
      </div>


      {/* Chat Input*/}
      <div className="chat-input">
        <textarea
          placeholder="Type your message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <button type="button" onClick={handleSend} disabled={!inputText.trim()}>Send</button>
      </div>

    </div>
  )
}

export default ChatroomPage
