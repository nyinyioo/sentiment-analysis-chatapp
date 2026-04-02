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
import LoginDemoPage from './pages/login-demo'       // demo path
import LoginAppPage from './pages/login-app'    // app path
import LobbyPage from './pages/lobby'
import ChatroomPage from './pages/chatroom'

function App() {
  return (
    // BrowserRouter enables client-side routing.
    // Instead of the browser asking the server for a new HTML page on every click,
    // React swaps DOM elements to show different "pages" without reloading the whole page.
    // This is what makes React a "Single Page Application" (SPA).
    <BrowserRouter>

      {/* Routes is the container that holds all your route definitions.
          It looks at the current URL and renders only the matching Route. */}
      <Routes>

        {/* Each Route maps a URL path to a component (page).
            When the user visits that path, that component renders. */}
        <Route path="/" element={<LoginDemoPage />} />
        <Route path="/login" element={<LoginAppPage />} />
        <Route path="/lobby" element={<LobbyPage />} />

        {/* :roomId is a URL parameter — it captures the dynamic part of the URL.
            e.g. /chat/abc123 → roomId = "abc123"
            We'll use this inside ChatroomPage to know which room to load. */}
        <Route path="/chat/:roomId" element={<ChatroomPage />} />

      </Routes>

    </BrowserRouter>
  )
}

// We export App so main.jsx can import and render it.
export default App
