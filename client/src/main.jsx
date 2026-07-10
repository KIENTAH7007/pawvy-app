import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import AuthGate from './AuthGate'

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthGate>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AuthGate>
)
