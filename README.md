# TutIn — Video Course Learning Platform

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Organize local courses, Google Drive courses, and custom YouTube playlists with saved progress, subtitles, notes, learning roadmaps, and study statistics.

**Live site:** [udemy.chaigallery.in](https://udemy.chaigallery.in/) · [Cloudflare fallback](https://tutin-learning.passishubham1.workers.dev/)

## Site screenshot

![TutIn homepage with course cards, progress, instructor navigation, and course search](docs/screenshots/homepage-cropped.png)

## Quick start

Install Node.js (Node 22 is used in CI), then run:

```sh
npm ci
npm run dev
```

On Windows, `start-dev.bat` installs missing dependencies and launches the app. Use `npm run start` for the optional Express companion server or `npm run desktop:build` for Electron.

## Features

- **Course imports:** Local folders, Google Drive, YouTube playlists, and additional YouTube URLs in an existing custom playlist.
- **Instructors:** Choose an existing instructor or add one during import; rename and merge instructors to group related courses.
- **Player:** Keyboard shortcuts, speed controls, fullscreen, controls that hide after two seconds of inactivity, A–B repeat, sleep timer, chapters, and timestamped note links.
- **Timeline previews:** Background preparation of frames every ten seconds for supported local videos. Persistent previews have a 32 MB storage budget and 30-day expiry. Hosted Drive videos use direct Google delivery with native resume and statistics; background Drive frame downloads stay disabled.
- **Duration visibility:** The header toggle hides upcoming lesson durations and course totals by default; toggle it off to display them.
- **Subtitles:** Import SRT/VTT, search timestamped transcripts, download subtitles, and customize caption appearance. Subtitles start disabled.
- **Progress and notes:** Durable playback bookmarks, unique watched ranges, study history, and sanitized rich-text notes with screenshots.
- **Roadmaps:** Create a roadmap before adding courses, edit connections, rename roadmaps, and undo changes.
- **Statistics:** Day/Week totals, hourly and daily charts, course breakdowns, streaks, optional daily goals, and CSV export.
- **Offline shell:** After an online visit, saved library information, notes, and statistics can remain accessible offline.

## Study statistics

Select **Day** to show the selected day's total, or **Week** to show the seven-day period ending on the selected date. The total in **Study consistency** follows this selection and changes when you navigate dates. Current and best streaks describe recorded study history.

Study time measures recorded playback: pauses, buffering, and skipped sections do not count. Unique watched coverage separately avoids counting replayed sections twice. Activity before tracking began cannot be reconstructed.

The **Daily study goal** dropdown offers Off, 15, 30, 45, 60, 90, and 120 minutes, with readable colors in both themes. The goal tracks today's activity even when viewing past dates.

## AI transcription and summaries

Open the player AI panel to transcribe a supported local video or use imported subtitles. Local Whisper transcription uses WebGPU when available, with CPU/WASM support. The model requires an initial download and processing uses your device's resources.

For summaries, add an **OpenRouter API key** in **Settings → AI & API Keys**. The default model is `openrouter/free`. Free inference depends on provider availability and rate limits; choosing another model may incur charges. Summary requests send transcript content to the provider.

The Google API key setting supports YouTube and Google Drive features that require their APIs. Google Colab integration is currently a proposal, not an implemented feature.

## Storage and backups

- The hosted app stores its library and durable progress in IndexedDB, with compatibility records in localStorage. The companion server also uses SQLite.
- Export backups from **Settings → Data**. Backups include watched ranges, study history, and chapters; restoration validates records before applying them.
- A hard refresh normally preserves browser storage. Clearing site data, private browsing, or browser storage eviction can remove it. Keep an exported backup.
- Local folder access recovers automatically where saved permissions allow it. Browsers may still require renewed permission. Backups cannot restore missing files or file access permissions.
- The red **Clear progress** control asks for confirmation before resetting progress.

The offline shell does not cache online video streams, API responses, or AI model downloads. Drive's custom player requests video directly from Google and records resume positions, study time, and unique watched ranges. There is no video relay, site redirect, or Drive preview fallback. YouTube controls its embedded player's native timeline.

For reliable public Drive playback, enable Google Drive API in your Google Cloud project, create a browser API key, and add it in **Settings → AI & API Keys → Google API Key**. Restrict the key to the Drive API and the website origins you use (for example, `https://udemy.chaigallery.in/*`). Video requests then go directly to Google's media API. Public download permission and a browser-supported original codec are required. An API key does not grant access to private or download-restricted files. Without a key, the player attempts Google's public download URL, which Google may refuse. Failed playback keeps existing progress and provides a direct link to the relevant settings tab.

## Cloudflare hosting

The hosted app runs on Cloudflare Workers with Static Assets. Static pages and assets are served separately from API functions; public course imports use the Worker. Hosted Drive playback streams directly from Google to avoid consuming a server relay's transfer allowance. No paid storage or video service is provisioned; dynamic requests remain subject to Cloudflare's free-plan limits.

Run `npm run deploy:cloudflare` after `npx wrangler login` to build and deploy. See [Cloudflare deployment and migration](docs/CLOUDFLARE.md) for routing, backups, verification, and deployment instructions. The former Vercel address is not the active Cloudflare site.

## Development and validation

```sh
npm test
npm run lint
npm run build -- --base=/
```

Run all checks with `npm run check`. GitHub Actions runs tests, lint, and the production build on pushes and pull requests. Automated tests cover storage, backup validation, import rollback, subtitles, previews, study calculations, and learning tools. Real-device touch/fullscreen behavior and provider availability require separate verification.

**Stack:** React 18, Vite 6, Tailwind CSS, React Router 7, IndexedDB, optional Express/SQLite services, Electron, and Transformers.js.

See [implementation details](docs/IMPROVEMENTS.md) for storage, player, offline, and validation behavior.
