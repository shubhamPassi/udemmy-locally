// Public application identifier, not an API key or client secret. Google Cloud
// restricts this OAuth web client to these deployed JavaScript origins.
const appClientId = '175015546102-a4pluug69ph7haeki986590hghcj1ho3.apps.googleusercontent.com'
const deployedOrigins = new Set(['https://udemy.chaigallery.in','https://tutin-learning.passishubham1.workers.dev'])

export function googleClientId(configured='', origin=typeof window!=='undefined'?window.location?.origin:'') {
    if (configured?.trim()) return configured.trim()
    return deployedOrigins.has(origin) ? appClientId : ''
}
