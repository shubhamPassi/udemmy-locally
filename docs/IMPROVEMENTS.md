# Learning app improvements

Implemented on 13 October 2026. This release adds no paid service.

## Data safety

- Playback bookmarks, watched ranges, study sessions, imported captions and chapters have durable IndexedDB storage. Existing local records migrate before the app starts.
- LocalStorage remains a compatibility mirror. Storage write failures surface a notification; progress can still be exported from its in-memory snapshot.
- Watched ranges merge inside a database transaction, protecting against overlapping updates from multiple tabs.
- Backups are validated before mutation. Hosted restoration writes the library and progress in one transaction and preserves existing connected folder/file handles. Invalid records or a failed transaction leave the previous library intact.
- Rich-text notes are sanitized when pasted, saved, restored and displayed. Formatting and images remain supported; executable HTML and unsafe links are removed.

## Player and learning tools

- Drive playback now uses only the custom native player and direct Google source URLs. A configured Google API key selects Google's official media API for publicly downloadable files; missing keys use Google's public download URL, which Google may refuse. All hosted video relays and redirects are retired, including the old Vercel relay. Native bookmarks, measured study time, and unique watched ranges remain in browser storage. Drive timeline previews are enabled with a configured key and use a single paced decoder directly against Google, with cached ten-second frames and buffering priority. Background scans of other Drive lessons remain disabled. Time spent in the old preview-only mode cannot be recovered.

- Drive failures no longer switch to Google's preview player. After bounded retries, an error explains API key, access, or original-codec requirements and offers Retry and Google API settings. Existing progress is preserved; failed playback cannot generate study time.

- Ten-second preview frames are prepared independently of hover, saved between visits, and refreshed when the video identity or file metadata changes. Saved previews have a 32 MB budget and 30-day expiry. Transient failures receive a selective retry. Preview media never contributes to watched progress.
- The **Learning tools** book icon opens A–B repeat, a 15/30/60-minute sleep timer, manual chapters, timestamped note links and a keyboard shortcut guide.
- Chapters persist and are included in backups. Native timelines show chapter and note markers. YouTube offers these tools through the overlay; its own timeline remains under YouTube's control.
- Repeat mode suppresses automatic lesson advancement and resumes the selected section at the video end. Playback is checkpointed before a repeat seek.
- Transcript search filters matching lines while preserving their jump timestamps. SRT and VTT downloads are generated in the browser, including on the hosted site.

## Offline use

The HTTPS app prepares an offline shell after an online visit. Saved course lists, notes and statistics remain available offline. The service worker does not cache API responses, online video streams or AI model downloads. Local video access still depends on the browser's folder permissions.

## Validation and maintenance

- `npm test` runs storage, import rollback, note sanitization, subtitle, preview, offline routing, learning tools and Node DOM regression tests.
- `npm run lint` requires zero warnings. Unused legacy bindings were removed, stale effect callbacks now use stable event wrappers, and context hooks are separate from component exports.
- `npm run build -- --base=/` produces the hosted application and its offline asset manifest.
- GitHub Actions runs tests, lint and the production build on pushes and pull requests.
- Testing for this release uses Node, simulated DOM, mocked IndexedDB and builds. No browser interaction or live deployment inspection is performed.

Real hardware touch/fullscreen behavior and provider network limits are outside these automated checks.
