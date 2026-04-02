
/**
 * Vite configuration for React frontend.
 * "Settings" for React dev server
 *  proxy to express backend.
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  
  // react dev server (vite default port)
  server: {
    port: 5173,       

    /**
     * any requests to /api will be forwared to express backend
     * react port 5173 -> express port 3001
     * ex: fetch('/api/login') -> http://localhost:3001/api/login
     */
    proxy: {          
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true, 
      }, 

      /**
       * any requests to /ws will be forwared to express backend
       * react port 5173 -> express port 3001
       * ex: new WebSocket('ws://localhost:5173/ws') -> ws://localhost:3001/ws
       */
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
