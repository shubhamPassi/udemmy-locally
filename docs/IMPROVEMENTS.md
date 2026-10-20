# Learning app improvements

Implemented on 13 October 2026. This release adds no paid service.

## Data safety

- Playback bookmarks, watched ranges, study sessions, imported captions and chapters have durable IndexedDB storage. Existing local records migrate before the app starts.
- LocalStorage remains a compatibility mirror. Storage write failures surface a notification; progress can still be exported from its in-memory snapshot.
- Watched ranges merge inside a database transaction, protecting against overlapping updates from multiple tabs.
- Backups are validated before mutation. Hosted restoration writes the library and progress in one transaction and preserves existing connected folder/file handles. Invalid records or a failed transaction leave the previous library intact.
- Rich-text notes are sanitized when pasted, saved, restored and displayed. Formatting and images remain supported; executable HTML and unsafe links are removed.

## Player and learning tools

- Drive resume and statistics are restored through a native player with a redirect-only Cloudflare endpoint. The browser obtains video bytes directly from Google, while bookmarks, measured study time, and unique watched ranges remain in browser storage. A video-specific no-referrer policy avoids Google's referrer-dependent confirmation response. Background Drive thumbnail/duration downloads stay disabled; Google preview remains a clearly labelled fallback if direct access fails. Time spent in the old preview-only mode cannot be recovered.

- Drive playback automatically switches to Google's preview player after two failed direct-stream retries. Existing bookmarks remain intact; preview mode offers a direct Drive link and a retry of the resumable player. Google preview does not expose playback time, so it cannot update resume positions or study-time tracking.

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
