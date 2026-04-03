/**
 * main.jsx
 * - entry point of the React app
 * - renders the root <App /> component into the DOM
 * 
 * Flow
 * ------------------------------
 * index.html
 *    ↓
 * <div id="root"></div>
 *    ↓
 * main.jsx
 *    ↓
 * <App /> 
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// enable StrictMode for entire app 
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
