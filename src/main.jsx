import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { SettingsProvider } from './contexts/SettingsContext.jsx'
import './index.css'
import { requestPersistentStorage } from './utils/browserPersistence.js'
document.addEventListener('pointerdown', () => { requestPersistentStorage() }, { once: true })

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <ThemeProvider>
                <SettingsProvider>
                    <App />
                </SettingsProvider>
            </ThemeProvider>
        </BrowserRouter>
    </StrictMode>,
)

window.addEventListener('load',()=>{const timing=performance.getEntriesByType('navigation')[0];if(timing)document.documentElement.dataset.startupTiming=JSON.stringify({domInteractiveMs:Math.round(timing.domInteractive),loadMs:Math.round(performance.now())})},{once:true})
