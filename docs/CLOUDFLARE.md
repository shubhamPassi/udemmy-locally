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

- Hosted Drive playback uses Google's iframe directly. The app does not relay video bytes or generate background timeline frames from Drive.
- `/api/drive-video` returns HTTP 410 without contacting Google. This protects against older cached app versions continuing to request the former video relay.
- Public course imports use `/api/public-import`; successful public metadata is cached for five minutes. Existing API keys remain browser settings.
- Local files still use the normal native player, bookmarks, subtitles, and previews. YouTube uses its own player.
- Google preview does not expose playback time. Previous bookmarks remain stored, but automatic resume, watched-range updates, and study-time measurement cannot run inside that iframe. Completion can still be marked manually.
- No D1, R2, KV, Stream, paid plan, or paid compute resource is provisioned. Dynamic Worker requests still have Cloudflare free-plan limits; this is not unlimited backend hosting.

## Domain migration and saved data

Keep `https://udemy.chaigallery.in` when moving from Vercel to preserve the same browser origin and access to its IndexedDB/localStorage data. Do not clear site data during migration. Progress saved at `udemmy-locally.vercel.app` belongs to a different origin and needs a backup export/import.

After a deployment, close old app tabs and reopen the custom domain so its waiting service worker can activate. A refresh can still be controlled by an older worker while other tabs remain open.

For rollback, redeploy a previously tested Cloudflare version with Wrangler or the dashboard. Moving back to Vercel also requires restoring the custom-domain DNS record; Vercel must no longer be paused.

## Verification without a browser

The Node tests cover Worker import routing, disabled video relay, native versus hosted Drive policy, and player recovery with a simulated DOM. Verify production with HTTP requests to `/`, a nested course URL, `/api/health`, a real public import, and `/api/drive-video` (expected 410). Do not clear or modify users' browser storage to test deployment.
