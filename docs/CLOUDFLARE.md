# Cloudflare hosting

TutIn deploys to Cloudflare Workers with Static Assets on the free plan. Static files and SPA routes are served by the asset service; only `/api/*` routes invoke the Worker.

## Deploy

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

Use Node 22. `wrangler.jsonc` declares the worker, account, static asset directory, SPA routing, and any production custom domain. Run `npm run preview:cloudflare` for a local Workers preview; this is separate from the optional Express companion server.

Before deploying, run `npm run check` and `npx wrangler deploy --dry-run`. GitHub pushes alone do not deploy Cloudflare unless a Cloudflare Git build integration or CI deployment is configured. This repository includes validation CI; deploy explicitly with the command above.

## Video traffic and free limits

- Hosted Drive playback uses the custom native player with a Google URL as its source. With a Google API key configured, the source is Google's official `files.get?alt=media` endpoint. Without a key, it attempts Google's public download URL, which is not guaranteed to work in an embedded player.
- No video bytes or playback redirects pass through Cloudflare. `/api/drive-video` is retired with HTTP 410 and no Location header. The old Vercel video relay is also retired. The frontend never requests either endpoint.
- Native Drive playback records bookmarks, actual study time, and unique watched ranges. Background Drive frame extraction and duration scans are disabled to avoid repeated media requests. Active-lesson duration is saved when metadata loads; hover timestamps remain available. OAuth playback uses a browser service worker and short-lived per-tab authorization headers directly to Google.
- Loading state clears on media readiness/playing events. Initial loading has a 30-second timeout, and unsupported/failed media responses do not receive automatic repeated format-error retries. Google may still temporarily block automated media requests; the application cannot clear an existing provider block.
- Public course imports use `/api/public-import`; successful public metadata is cached for five minutes. Existing API keys remain browser settings.
- Local files still use the normal native player, bookmarks, subtitles, and previews. YouTube uses its own player.
- If Google refuses direct playback, bounded retries stop with a clear access/configuration error. There is no Google preview iframe fallback. The player offers Retry and Google API settings. Existing bookmarks remain intact; study time is never invented while playback is unavailable.
- Enable Google Drive API for a browser API key, restrict its HTTP referrers to your website origins, and allow the Drive API. Public download permission and a supported original video codec are required. Keys are passed directly to Google, not to Cloudflare; they are not included in error logs. Private files require a separate Google authorization integration and cannot be unlocked with an API key.
- No D1, R2, KV, Stream, paid plan, or paid compute resource is provisioned. Dynamic Worker requests still have Cloudflare free-plan limits; this is not unlimited backend hosting.

## Domain migration and saved data

Keep `https://udemy.chaigallery.in` when moving from Vercel to preserve the same browser origin and access to its IndexedDB/localStorage data. Do not clear site data during migration. Progress saved at `udemmy-locally.vercel.app` belongs to a different origin and needs a backup export/import.

After a deployment, close old app tabs and reopen the custom domain so its waiting service worker can activate. A refresh can still be controlled by an older worker while other tabs remain open.

For rollback, redeploy a previously tested Cloudflare version with Wrangler or the dashboard. Moving back to Vercel also requires restoring the custom-domain DNS record; Vercel must no longer be paused.

## Verification without a browser

The Node tests cover Worker import routing, retired relay endpoints, direct Google source URLs, native Drive resume, real study measurements, pause/seek/replay handling, and failure without preview fallback in a simulated DOM. Verify production with HTTP requests to `/`, a nested course URL, `/api/health`, a real public import, and `/api/drive-video` (expected 410 without a Location header). Do not clear or modify users' browser storage to test deployment. Tests cannot guarantee that Google will authorize a particular user's key or file; that access must be configured in Google.

### Account-authorized Google Drive playback

For private or account-restricted videos, open **Settings → AI & API Keys → Google Drive account playback**. Configure an OAuth **Web application** Client ID (not an API key), then click **Connect Google Drive** and approve read-only access with the account that can download the video.

Google Cloud setup:
1. Enable Google Drive API in your project.
2. Configure the OAuth consent screen, add `https://www.googleapis.com/auth/drive.readonly`, and add your Google account as a test user while the app is in Testing.
3. Create an OAuth Web application Client ID. Add `https://udemy.chaigallery.in` and, if used, `https://tutin-learning.passishubham1.workers.dev` as authorized JavaScript origins. No callback URL or client secret is used by this popup token flow.
4. Paste the Client ID in Settings. Google consent requires your interaction; configuration alone does not authorize access.

The browser service worker attaches a short-lived bearer token directly to Google media requests and preserves HTTP Range seeking. The optional authorization-code backend can renew access and restore it after browser restarts using an encrypted HttpOnly cookie. Refresh tokens stay inaccessible to JavaScript and are never sent in video URLs. The legacy token-only flow still retains a short-lived access token in sessionStorage when the backend is unconfigured. The player waits for worker authorization before starting authenticated playback. Disconnect clears the local session and revokes the Google grant.

Background **Drive** frame extraction is disabled to avoid repeated media requests competing with playback. Local-video previews remain available; the Drive timeline still shows hover timestamps. Google can still refuse a request because of account permissions, disabled downloads, quotas, or automated-traffic restrictions; OAuth does not bypass those restrictions. Original codecs must still be supported by the browser.

References: [Google token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [why media tokens must not be placed in URLs](https://workspace.google.com/blog/developers-practitioners/upcoming-changes-to-the-google-drive-api-and-google-picker-api).

### Online course resync and transcripts

`/api/public-import` accepts `fresh=1` for explicit resync requests, bypassing the five-minute public metadata cache. Google Drive folder scans collect video and SRT/VTT file references; the browser reconciles them with existing provider IDs. The new `type=transcript` YouTube metadata request retrieves caption text only, with a bounded timeout and an allowlist of YouTube player/watch/timedtext paths. It never proxies media streams. Private or unavailable captions return an explanatory failure.

Caption cues and source revision markers stay in the existing durable subtitle progress records. The Transcription panel and Subtitle settings share the same loader; imported/manual subtitles remain authoritative. Google Drive subtitle bytes continue to go directly to the browser using the current short-lived account token or public API key. Companion SQLite adds nullable provider/revision columns so desktop source metadata and backup restoration retain the same associations.

The public, keyless media path omits the video element’s crossorigin attribute so native playback is not blocked merely because a public download response lacks CORS headers. API-key and account-authorized media retain CORS mode. The app includes its public OAuth Web Client ID only for its two configured deployed origins; Incognito users can connect without copying credentials from another profile. Other hosting origins still need their own OAuth configuration. No API key or client secret is bundled.

### Remembered sign-in deployment

Set the public `GOOGLE_OAUTH_CLIENT_ID` Worker variable and install `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_SESSION_SECRET` with `wrangler secret put`. Generate the encryption secret securely; never place either secret in source, terminal output or documentation. Add `/api/google/auth/callback` under each deployed HTTPS origin to Google Cloud's authorized redirect URIs. `/api/google/auth/config` reports only whether this setup is enabled and the public Client ID.

`GET /api/google/auth/start` creates an encrypted 10-minute OAuth state cookie and uses state plus PKCE for Google's authorization-code flow. The callback exchanges the code server-side and writes an AES-GCM encrypted 30-day session cookie marked Secure, HttpOnly, SameSite=Lax and restricted to its origin. `GET /api/google/auth/session` requires the app's custom session header, renews expired access through Google, and returns only short-lived access to the browser. `POST /api/google/auth/disconnect` checks Origin and the custom header, clears the cookie and revokes the grant. Every response is uncached. No video requests use these endpoints.

The browser renews shortly before access expiry and after returning from the background; successful background renewal updates the service worker without remounting a healthy player. Cookie removal, Incognito shutdown, provider revocation and Google Testing-mode token expiry still require a new connection. No paid Cloudflare storage product is introduced.
