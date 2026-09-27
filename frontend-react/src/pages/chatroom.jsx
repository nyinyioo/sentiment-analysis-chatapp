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
import {
  getMessages, deleteDemoMessages, getRooms,
  getWhispers, clearWhispers, shareWhisper,
} from '../services/rooms'
import { getSettings, updateSettings } from '../services/auth'
import { useAuth } from '../context/AuthContext'

// import sentiment analysis utilities 
import { getEmotion, EMOTIONS, EMOTION_ORDER } from '../utils/sentiment'
import { getAvatarColor, getInitial } from '../utils/avatar'
import { parseWakeWord, BOT_NAME } from '../utils/wakeword'
import { whisperRows, mergeTimeline } from '../utils/timeline'
import '../styles/chatroom.css'


const SCROLL_THRESHOLD = 80

// determines the sender of a message
// falls back to the logged in user if no username
function senderOf(msg, me) {
  return msg.isBot ? (msg.username || BOT_NAME) : (msg.username || me)
}

// check if message is sent by the logged in user
function isMine(msg, me) {
  return !msg.isBot && senderOf(msg, me) === me
}

// bot greeting shown at the top of every room
const GREETING = {
  username: BOT_NAME,
  text: `Hey! I'm ${BOT_NAME}. Ask me anything privately with "hey ${BOT_NAME}, ..." and only you will see my reply.`,
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

  // true while the assistant is working on a whispered question
  const [thinking, setThinking] = useState(false)


  // 'session': chat cleared when the user leaves the room
  // 'remember': kept until the user clears them
  // Demo rooms never save anything.
  const [memory, setMemory] = useState('session')

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

    // React StrictMode runs effects twice in dev. 
    let cancelled = false
    Promise.allSettled([getMessages(roomId), getWhispers(roomId)])
      .then(([historyRes, whispersRes]) => {
        if (cancelled) return
        // a room with no stored conversation yet returns 404: treat as empty
        const conversation = historyRes.status === 'fulfilled' ? historyRes.value : null
        const whispers = whispersRes.status === 'fulfilled' ? (whispersRes.value?.whispers || []) : []
        if (whispersRes.status === 'rejected') console.error('[Chatroom] Failed to load whispers:', whispersRes.reason)

        // my saved whispers slot in where they happened in the conversation
        const timeline = mergeTimeline(
          conversation?.messages || [],
          whispers.flatMap(whisperRows),
          conversation?.timestamp || 0,
        )
        // greeting, then stored timeline, then anything that already arrived
        // live over the socket while loading
        setMessages(prev => [GREETING, ...timeline, ...prev.filter(m => m !== GREETING)])
      })

    return () => { cancelled = true }
  }, [roomId, isDemo])


  // my assistant memory setting (app users only)
  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    getSettings()
      .then(s => { if (!cancelled && s?.whisperMemory) setMemory(s.whisperMemory) })
      .catch(() => { /* keep the default */ })
    return () => { cancelled = true }
  }, [isDemo])


  // scroll the list to the newest message
  const scrollToBottom = useCallback(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [])

  // implement auto scroll - every time message change
  useEffect(() => {
    scrollToBottom()
  }, [messages, thinking, scrollToBottom])

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
    // private assistant reply: only this client receives it
    if (msg.type === 'whisper') {
      if (msg.pending) {
        setThinking(true)
        return
      }
      setThinking(false)
      setMessages(prev => [...prev, { ...msg, private: true, isBot: true, sharedAt: null }])
      return
    }
    setMessages(prev => [...prev, msg])
  }, [])

  const { sendMessage } = useWebSocket(roomId, handleMessage)

  // handle send messages
  function handleSend() {
    const text = inputText.trim()
    if (!text) return

    // "hey chat, ..." is a whisper: show the question locally, the server
    // will answer only this client and never broadcast it to the room
    const wake = parseWakeWord(text)
    if (wake.addressed) {
      setMessages(prev => [...prev, { username, text, private: true, query: wake.query }])
      setThinking(true)
    }

    sendMessage(text)
    setInputText('')
  }

  // post a private assistant answer into the group as a normal message
  function handleShare(msg) {
    // prefix must not look like a wake word, or the server would treat the
    // shared message as another whisper
    sendMessage(`${BOT_NAME} says: ${msg.text}`)
    setMessages(prev => prev.map(m => (m === msg ? { ...m, sharedAt: true } : m)))
    if (msg.id && msg.saved) {
      shareWhisper(roomId, msg.id).catch(err => console.error('[Chatroom] Failed to mark whisper shared:', err))
    }
  }

  // choose how long my chats with the assistant are kept.
  // Switching never deletes anything by itself: 'session' clears on leave.
  async function handleSetMemory(next) {
    if (next === memory) return
    try {
      await updateSettings({ whisperMemory: next })
      setMemory(next)
    } catch (err) {
      console.error('[Chatroom] Failed to update setting:', err)
    }
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
      // leaving the room ends a session-mode chat history with the assistant
      // (the server also does this after a grace period if we just close the tab)
      if (memory === 'session') {
        try { await clearWhispers(roomId) } catch { /* server-side grace clear will catch it */ }
      }
      navigate('/lobby')
    }
  }

  // get the list of participants in the chat room
  const participants = useMemo(() => {
    const others = []
    for (const msg of messages) {
      if (msg.private) continue
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

              {!isDemo && (
                <div className="menu-section" role="group" aria-label={`Keep chats with ${BOT_NAME}`}>
                  <div className="menu-section-title">Keep chats with {BOT_NAME}</div>
                  <div className="segmented">
                    <button
                      type="button"
                      className={memory === 'remember' ? 'active' : ''}
                      aria-pressed={memory === 'remember'}
                      onClick={() => handleSetMemory('remember')}
                    >
                      Always
                    </button>
                    <button
                      type="button"
                      className={memory === 'session' ? 'active' : ''}
                      aria-pressed={memory === 'session'}
                      onClick={() => handleSetMemory('session')}
                    >
                      Until I leave
                    </button>
                  </div>
                </div>
              )}

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

            // private whisper to / from the assistant: no emotion colour,
            // dashed bubble, "only you" label, share button on answers
            if (msg.private) {
              return (
                <div
                  key={index}
                  className={`message-row private ${mine ? 'mine' : 'theirs'}`}
                >
                  {!mine && (
                    <div className="message-sender">
                      <span className="sender-avatar assistant-avatar" aria-hidden="true">
                        {getInitial(sender)}
                      </span>
                      <span className="sender-name">{sender}</span>
                    </div>
                  )}

                  <div
                    className={`message-bubble whisper ${msg.error ? 'whisper-error' : ''}`}
                    dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }}
                  />

                  <div className="whisper-meta">
                    <span>
                      {mine ? 'Only you can see this' : `Only you can see ${BOT_NAME}'s reply`}
                      {!mine && !msg.error && !isDemo && memory === 'session' && ' · cleared when you leave'}
                    </span>
                    {!mine && !msg.error && (
                      msg.sharedAt
                        ? <span className="shared-tag">Shared</span>
                        : (
                          <button
                            type="button"
                            className="share-button"
                            onClick={() => handleShare(msg)}
                          >
                            Share to group
                          </button>
                        )
                    )}
                  </div>
                </div>
              )
            }

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

          {thinking && (
            <div className="message-row private theirs" aria-live="polite">
              <div className="message-sender">
                <span className="sender-avatar assistant-avatar" aria-hidden="true">
                  {getInitial(BOT_NAME)}
                </span>
                <span className="sender-name">{BOT_NAME}</span>
              </div>
              <div className="message-bubble whisper thinking">
                <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
              </div>
            </div>
          )}
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
          placeholder={`Type a message, or "hey ${BOT_NAME}, ..." to ask privately`}
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
