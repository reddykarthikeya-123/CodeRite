import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Safe root element access with proper error handling
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found. Ensure there is a <div id="root"></div> in your HTML.')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
