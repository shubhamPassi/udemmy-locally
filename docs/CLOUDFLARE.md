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
- Native Drive playback records bookmarks, actual study time, and unique watched ranges. Background Drive thumbnail and duration scans remain disabled; active-lesson duration is saved when metadata loads.
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
