/**
 * App.jsx
 * - Root component of the React app
 * - Handles client-side routing
 * - Maps URL paths to page components
 *
 * Flow:
 * ------------------------------------
 * main.jsx
 *    ↓
 * <App />
 *    ↓
 * <BrowserRouter>
 *    ↓
 * <Routes>
 *    ↓
 * "/"            → <LoginPage />
 * "/lobby"       → <LobbyPage />
 * "/chat/:roomId"→ <ChatroomPage />
 *    ↓
 * UI shown to user
 */


// import react-router components for client-side routing
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// import page components to map to URL routes
import LoginDemoPage from './pages/login-demo'
import LoginAppPage from './pages/login-app'
import LobbyPage from './pages/lobby'
import ChatroomPage from './pages/chatroom'

// AuthProvider wraps the app to provide global auth state
// ProtectedRoute blocks unauthenticated access to lobby and chatroom
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    // BrowserRouter enables client-side routing.
    // Instead of the browser asking the server for 
    // a new HTML page on every click,
    // React swaps DOM elements to show different "pages"
    // without reloading the whole page.
    // This is what makes React a "Single Page Application" (SPA).
    <BrowserRouter>
      {/* AuthProvider wraps all routes so every page
       can access auth state via useAuth() */}
      <AuthProvider>
        <Routes>
          {/* Public routes — no login required */}
          <Route path="/" element={<LoginDemoPage />} />
          <Route path="/login" element={<LoginAppPage />} />

          {/* Protected routes — redirects to /login if no valid session */}
          <Route path="/lobby"
           element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
          <Route path="/chat/:roomId" 
          element={<ProtectedRoute><ChatroomPage /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

// We export App so main.jsx can import and render it.
export default App
