import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/onest'
import App from './App'
import { startTranslator } from './i18n'
import './index.css'

startTranslator()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
