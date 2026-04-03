/**
 * chatroom.jsx
 * - Real-time chat interface with sentiment analysis
 * - Equivalent of chatroom.ejs
 */

// import react hooks and api calls
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import useWebSocket from '../hooks/useWebSocket'
import { getMessages, deleteDemoMessages, getRooms } from '../services/rooms'
import '../styles/chatroom.css'

function ChatroomPage() {

  // read roomId from /chat/:roomId
  const { roomId } = useParams()            
  const navigate = useNavigate()      

  // A room is a demo room if its ID starts with 'temp_'
  const isDemo = roomId.startsWith('temp_')

  // chat room state
  // initialize with bot message
  const [messages, setMessages] = useState(
    [{
      username: 'bot',
      text: 'How are you doing today?',
      isBot: true,
      sentiment: { label: 'LABEL_2', score: 0.8 }
    }] 
  )
  const [inputText, setInputText] = useState('')
  const [roomName, setRoomName] = useState('')

  // useRef gives us direct access to the
  // message list DOM node for scrolling
  const messageListRef = useRef(null)


  // loads the room name
  useEffect(() => {
    if (isDemo) {
      setRoomName('Demo Chat')
    } else {
      getRooms()
        .then(rooms => {
          const room = rooms.find(r => String(r._id) === roomId)
          if (room) setRoomName(room.name)
        })
        .catch(() => setRoomName(roomId))
    }
  }, [roomId])


  /**
   * loads message history
   * demo rooms: no memory
   * app rooms: persistant memory   
   */
  useEffect(() => {
    if (!isDemo) {
      getMessages(roomId)
        .then(conversation => {
          if (conversation?.messages) {
            // append history after the greeting instead of replacing it
            setMessages(prev => [...prev, ...conversation.messages])
          }
        })
        .catch(err => console.error('[Chatroom] Failed to load history:', err))
    }
  }, [roomId])


  // implement auto scroll - every time message change
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight
    }
  }, [messages])


  /**
   * websocket message handler
   * useCallback: react hook that caches (memoizes) 
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
      try { await deleteDemoMessages() } catch (_) {}
      navigate('/')
    } else {
      navigate('/lobby')
    }
  }

  /**
   * Computes the sentiment score of a message
   * 
   * LABEL_0 = negative (red) 
   * LABEL_1 = neutral (gray)
   * LABEL_2 = positive (green)
   * 
   * @param {string} label 
   * @param {number} score 
   * @returns {string} CSS rgb() color string
   */
  function getSentimentColor(label, score) {
    let red = 0, green = 0, blue = 0
    switch (label) {
      case 'LABEL_0':
        red = 255; green = 255 * (1 - score); blue = 255 * (1 - score); break
      case 'LABEL_1':
        red = green = blue = 255 * score + 128 * (1 - score); break
      case 'LABEL_2':
        red = 255 * (1 - score); green = 255; blue = 255 * (1 - score); break
      default:
        red = green = blue = 200
    }
    return `rgb(${Math.floor(red)}, ${Math.floor(green)}, ${Math.floor(blue)})`
  }

  // render
  return (
    <div className="chat-container">

      {/* Header */}
      <div className="chat-header">
        <h1>{roomName}</h1>
        <button className="exit-button" onClick={handleExit}>Exit</button>
      </div>

      {/* Message List */}
      <div className="message-list" ref={messageListRef}>
        {messages.map((msg, index) => {
          const color = getSentimentColor(
            msg.sentiment?.label || 'LABEL_1',
            parseFloat(msg.sentiment?.score) || 0.5
          )
          return (
            <div
              key={index}
              className={`message ${msg.isBot ? 'bot-message' : 'my-message'}`}
              style={{ backgroundColor: color }}
            >
              <div className="message-user">
                {msg.isBot ? msg.username : (msg.username || roomId)}:
              </div>
              <div
                className="message-text"
                dangerouslySetInnerHTML={{ __html: marked.parse(msg.text || '') }}
              />
            </div>
          )
        })}
      </div>


      {/* Chat Input*/}  
      <div className="chat-input">
        <textarea
          placeholder="Type your message..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSend}>Send</button>
      </div>

      <footer>
        <div className="footer-bottom">&copy; 2026</div>
      </footer>

    </div>
  )
}

export default ChatroomPage
