  /**
   * lobby.jsx
   * - landing page after login
   * - equivalent of lobby.ejs
   */

// import react hooks and API calls
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from '../services/auth'
import { getRooms, createRoom, deleteRoom } from '../services/rooms'
import { useAuth } from '../context/AuthContext'
import '../styles/lobby.css'


function LobbyPage() {

  /**
   * useState 
   * const [state, setState] = useState (initialState)
   */
  const [rooms, setRooms] = useState([])                // list of chat rooms
  const [newRoomName, setNewRoomName] = useState('')    // input for new room names
  const [roomError, setRoomError] = useState('')        // error shown in rooms tab
  const [activeTab, setActiveTab] = useState('rooms')   // toggle 'rooms' or 'profile'

  // profile tab state
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [usernameMsg, setUsernameMsg] = useState({ text: '', type: '' })  // type: 'error' | 'success'
  const [passwordMsg, setPasswordMsg] = useState({ text: '', type: '' })

  const navigate = useNavigate()

  // get username and logout from AuthContext 
  const { username, logout } = useAuth()

  useEffect(() => {
    loadRooms()
  }, [])

  // get room object [{_id, name, image, messages}]
  async function loadRooms() {
    try{
      const data = await getRooms()
      setRooms(data)
    } catch (err){
      setRoomError(err.message)
    }
  }

  // Room Creation
  async function handleCreateRoom(){
    if (!newRoomName.trim()) return
    try {
      await createRoom(newRoomName.trim())
      setNewRoomName('')
      loadRooms()
    } catch (err) {
    setRoomError(err.message)
    }
  }

  // Room Deletion
  async function handleDeleteRoom(id){
    try {
      await deleteRoom(id)
      loadRooms() // refresh room after delete
    } catch (err) {
    setRoomError(err.message)
    }
  }

  // Allow enter to create room
  function handleRoomInputKeyDown(e) {
    if (e.key === 'Enter') handleCreateRoom()
  }

  // Update Username
  async function handleUpdateUsername() {
    if (!newUsername.trim()) return
    try {
      await updateProfile({username: newUsername.trim()})
      navigate('/login')
    } catch (err) {
      setUsernameMsg({text: err.message, type: "error"})
    }
  }

  // Update Password
  async function handleUpdatePassword() {
    if (!newPassword) return
    try {
      await updateProfile({ password: newPassword })
      navigate('/login')
      } catch (err) {
      setPasswordMsg({ text: err.message, type: 'error' }) 
    }
  }

  return (
    <div className="lobby-container">

      {/* Header + Logout Button*/}
      <header className="lobby-header">
        <h1>CHATAPP</h1>
        <div className="header-right">
          <span>{username}</span>
          {/* logout: clear session on server, clear AuthContext state, redirect to login */}
          <button className="btn btn-danger" onClick={async () => {
            await fetch('/api/logout')
            logout()
            navigate('/login')
          }}>Logout</button>
        </div>
      </header>


       {/* Tabs:  clicking a tab updates activeTab state
                  will render profileView or lobbyView */}
      <nav className="tabs">
          <button
           className={`tab-btn ${activeTab === 'rooms' ? 'active' : ''}`}
           onClick={() => setActiveTab('rooms')}
           >
          Rooms </button>
          <button
           className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
           onClick={() => setActiveTab('profile')}
           >
          Profile </button>
      </nav>


      {/* Rooms Tab: Conditional only show this when activeTab === 'rooms'*/}
      {activeTab === 'rooms' && (
        <div>
          <div className="create-room-form">
            <input
              type = "text"
              placeholder = "New room name..."
              value = {newRoomName}
              onChange = {(e) => setNewRoomName(e.target.value)}
              onKeyDown = {handleRoomInputKeyDown}
            />
             <button className="btn btn-primary" onClick={handleCreateRoom}>
              Create
             </button>
          </div>
          {roomError && <p className="feedback-msg error">{roomError}</p>}

          {/* List rendering: .map() turns the rooms array into JSX elements.
                              room_.id used as key prop so React can track changes*/}
           <ul className="room-list">
            {rooms.length === 0 ? (
              <li className="room-item empty">No rooms yet. Create one above.</li>
            ) : (
              rooms.map((room) => (
                <li key={room._id} className="room-item">
                  <span className="room-name">{room.name}</span>
                  <button
                  className="btn btn-enter"
                  onClick={() => navigate(`/chat/${room._id}`)}
                  >Enter</button>
                  <button
                  className="btn btn-danger"
                  onClick={() => handleDeleteRoom(room._id)}
                  > Delete</button>
                </li>
              ))
            )}
           </ul>
        </div>
      )}


      {/* Profile Tab */}
      {activeTab === 'profile' && (
          <div>
          <div className="profile-section">
              <h3>Change Username</h3>
              <input
                type="text"
                placeholder="New username"
               value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleUpdateUsername}>
                Save
             </button>
              {usernameMsg.text && (
                <p className={`feedback-msg ${usernameMsg.type}`}>{usernameMsg.text}</p>
              )}
            </div>
  
            <div className="profile-section">
              <h3>Change Password</h3>
              <input
              type="password"
                placeholder="New password"
                value={newPassword}
                 onChange={(e) => setNewPassword(e.target.value)}
              />
              <button className="btn btn-primary" onClick={handleUpdatePassword}>
                Save
              </button>
              {passwordMsg.text && (
              <p className={`feedback-msg ${passwordMsg.type}`}>{passwordMsg.text}</p>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
  

export default LobbyPage
