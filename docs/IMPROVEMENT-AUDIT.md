# Learning-platform improvement audit

Updated 9 October 2026. The final verification pass used source inspection, automated tests, a production build, and deployment asset checks. Chrome was not opened during that pass, as requested.

## Implementation checklist

| Area | Implemented behavior | Evidence and limits |
| --- | --- | --- |
| Performance measurement | Local startup and selected-video readiness measurements; bounded background metadata requests and isolated progress updates. | Earlier Windows observations: course page DOM interactive 587 ms, page load 1,283 ms; Drive video ready in 7,402 ms; one navigation completed in 469 ms. These are individual observations. Real iPhone measurements require that device. |
| Progress backup | Export/import contains resume bookmarks, unique watched ranges, study sessions, subtitle cues, daily goal and duration-visibility preference. Repeated restores do not double-count; already connected local-file handles are preserved. Storage failures are reported. | `progress-backup.test.mjs`, `progress-persistence.test.mjs`; a live exported file previously contained four courses and 292 lessons plus progress data. JSON cannot transfer local file permissions to another browser or device. |
| Import reliability | Incomplete local, YouTube and Drive course records are cleaned up when an import fails. Browser video saves use bounded batches. | Cleanup handlers in `HomePage.jsx`; `batch-work.test.mjs`, `web-import.test.mjs`. If cleanup itself fails, the local import reports the remaining incomplete record. |
| Metadata loading | Two background workers, per-video failures, batched tree updates, active-lesson exclusion and selective retry of missing durations. | `watch-coverage.test.mjs`, `module-metadata.test.mjs`, `import-durations.test.mjs`. YouTube duration may become available only when its player opens. |
| Large playlists | Courses over 100 lessons mount nearby lesson controls with overscan. Offscreen placeholders retain measured heights and can be reached by keyboard. | `WindowedLesson.jsx`, `PlaylistSidebar.jsx`; earlier live check on a 147-lesson course mounted five lesson controls in the initially expanded module. Scrolling and resizing on a real iPhone remain device checks. |
| Drive playback | Two retries for direct-playback failures, a delayed buffering notice, recovery for prolonged stalls, and a small HEAD probe to distinguish access failures from temporary limits. Resume position is retained. | `drive-video.test.mjs`, `drive-failure.test.mjs`, playback-bookmark tests. Google availability and transfer limits cannot be eliminated by this app. |
| Cross-tab updates | Course edits, instructor changes and completion writes broadcast a debounced library change. Edits to different courses are combined into a broad refresh. Progress coverage updates and daily-goal changes also synchronize. | `library-changes.test.mjs`; listeners in library, instructor and player pages. Completed lesson changes preserve the running player's ID. |
| Image storage | New data-image thumbnails are resized within 1280 × 720 and converted to WebP when that produces a smaller result. Existing compressed images are retained when conversion would enlarge them. | `thumbnailCompression.js`; used by course creation/editing, URL-image loading and local import preview. Images hosted without download permission can remain remote URLs. |
| Storage management | Settings shows browser-wide usage, progress/preferences storage, persistent-storage status, last backup export, first-backup reminder and a warning near either storage limit. | `StorageStatus.jsx`, `storage-usage.test.mjs`; backup export updates the status immediately. Browser quota estimates vary by browser. |
| Mobile player | Playlist follows the video below 1024 px; responsive seeking controls; fullscreen API and iOS native-video fallback; local-folder reconnection on supported desktop browsers and clear guidance elsewhere. | Earlier portrait/landscape viewport checks showed no horizontal overflow. `reconnect-files.test.mjs` covers matching and ambiguous filenames. Actual iPhone touch/fullscreen checks are not claimed. |
| Accessibility | Modal labels, focus containment, Escape dismissal, restored focus, background scroll lock, labeled settings switches, accessible progress bar, keyboard section headings and named lesson/completion controls. | `useModalFocus.js`, Settings and playlist controls; earlier live Settings focus/Escape checks. New secondary text uses higher-contrast colors. Full screen-reader/device verification remains a manual check. |
| Instructor management | Existing instructor selection, add-new option, case/spacing normalization, unassigned group, rename/merge, and source avatar preservation when merging into an instructor without an avatar. | `instructor-names.test.mjs`, `instructor-management.test.mjs`; casing-only renames and merge preservation are tested. |
| Roadmaps | Create-first flow, rename, up to 20 undo snapshots, pointer/touch arrangement, fit-to-view, connection cancellation and keyboard removal of connections. | `roadmap.test.mjs`, `roadmapHistory.js`; undo snapshots copy the edited data so later movement cannot overwrite history. |
| Subtitles | Shared SRT/VTT import for native local and resumable Drive video; safe cue text; persistent cues; visibility toggle and removal; native text tracks for fullscreen compatibility. | `subtitles.test.mjs`; earlier live check confirmed a showing native subtitle track. Track reuse avoids accumulation on repeated visibility toggles. Drive preview and YouTube use their provider's caption capabilities. |
| Statistics | Day/Week views, hour selection, course breakdown, actual study-time recording, streaks, CSV export and an optional daily goal. Recorded time is distinguished from unreconstructable historical viewing. | `study-time.test.mjs`, `study-activity.test.mjs`, `learning-stats.test.mjs`; goal preferences are backed up. |
| Code maintenance | Removed unused speed-boost handlers/indicator and unused module-flattening code; shared API imports replace ineffective dynamic imports; cancellable delayed work; optional Markdown/video dependencies remain outside initial preloads. | Production build and relevant playback tests. Browser compatibility data in the publishing lockfile was updated. |

## Final automated verification

- `node --test tests/*.test.mjs`: 61 passed, 0 failed.
- `npm run build -- --base=/`: completed successfully in the publishing checkout, without the earlier mixed-import or old-browser-data warnings.
- `git diff --cached --check`: no whitespace errors.
- Source files are checked against the publishing checkout before the final push.
- Hosting remains the existing Vercel project and domain; no paid service was added.

## Checks requiring real iPhone access

These are explicitly unverified. A simulated viewport cannot prove native iOS behavior.

1. Open a public Drive course in Safari, play, seek forward/back, pause and reload; confirm resume is retained.
2. Rotate between portrait and landscape; confirm the player controls remain reachable and the playlist stays below the video.
3. Enter and exit native fullscreen; confirm imported captions are displayed and playback returns to the same lesson.
4. Toggle duration visibility and select Day/Week statistics; confirm the controls work without horizontal scrolling.
5. Try a local course restored from a backup; confirm the app explains that its original desktop folder must be reconnected on desktop Chrome/Edge. The iPhone cannot access a PC's G: drive.
6. With VoiceOver enabled, check the modal labels, playlist section buttons, lesson buttons and progress description.

No real-iPhone test result should be inferred from the passing automated tests or the prior Windows viewport checks.
