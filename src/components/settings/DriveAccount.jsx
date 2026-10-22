import { useEffect, useState } from 'react'
import { googleClientId } from '../../utils/googleClientConfig.js'
import { connectGoogleDrive, disconnectGoogleDrive, driveSession, loadGoogleIdentity, subscribeDriveSession, restoreDriveAuthorization } from '../../utils/driveAuthorization'

export default function DriveAccount({ clientId, onClientIdChange }) {
    const [session, setSession] = useState(driveSession)
    const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
    useEffect(() => { let active = true; loadGoogleIdentity().then(() => { if (active) setReady(true) }).catch(err => { if (active) setError(err.message) }); return () => { active = false } }, [])
    useEffect(() => subscribeDriveSession(setSession), [])
    useEffect(()=>{restoreDriveAuthorization()},[])
    const expired = session && session.expiresAt <= Date.now()
    function connect() {
        setBusy(true); setError('')
        const action = session && !expired ? disconnectGoogleDrive() : connectGoogleDrive(clientId)
        action.catch(err => setError(err.message)).finally(() => setBusy(false))
    }
    return <section className="p-4 rounded-lg border border-light-border dark:border-dark-border space-y-3">
        <h4 className="text-sm font-semibold">Google Drive account playback</h4>
        {onClientIdChange && <label className="block text-xs">OAuth Web Client ID<input aria-label="Google OAuth Web Client ID" value={googleClientId(clientId)} onChange={event => onClientIdChange(event.target.value)} placeholder="123456-….apps.googleusercontent.com" className="mt-2 w-full rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-surface px-3 py-2 text-sm" /></label>}
        <p className="text-xs leading-5">Connect the Google account that can download these videos. This requests read-only Drive access. Your short-lived connection survives refreshes in this tab until it expires or you disconnect. Google traffic and download restrictions still apply.</p>
        {onClientIdChange && <details className="text-xs leading-5"><summary className="cursor-pointer">Set up Google sign-in</summary><p className="mt-2">In Google Cloud, enable Drive API, configure the OAuth consent screen and add your account as a test user. Create a Web application OAuth Client ID with this authorized JavaScript origin: <code>{window.location.origin}</code>. Add the drive.readonly scope. Paste the Client ID above; no client secret is needed. Sign-in opens Google's consent popup.</p></details>}
        <button type="button" disabled={!ready || busy} onClick={connect} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Connecting…' : session && !expired ? 'Disconnect Google Drive' : 'Connect Google Drive'}</button>
        <p className="text-xs" role="status">{session && !expired ? 'Connected for this tab. Video streams directly from Google.' : 'Not connected. Public direct playback is tried without a key; connect only if Google requires account access.'}</p>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </section>
}
