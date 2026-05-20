import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

registerSW({
  onRegisteredSW(_, registration) {
    // Check for updates every 60 seconds while the page is open
    setInterval(() => registration?.update(), 60_000)
  },
  onNeedRefresh() {
    window.location.reload()
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
