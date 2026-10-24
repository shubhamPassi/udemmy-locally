# Drive timeline previews

Drive lessons can show cached thumbnail previews every ten seconds without
seeking the playing video or requesting extra video streams. Local video
previews keep their existing behavior. YouTube uses its embedded player.

## One-time preparation

Install Python 3 and FFmpeg on your computer. Use a local copy of a video you
can access, then run from the repository:

```powershell
python scripts/generate-drive-previews.py "D:\Courses\Lesson.mp4"
```

This creates `Lesson.mp4.tutin-previews.json`. Upload that file into the **same
Google Drive folder** as `Lesson.mp4`, with the same viewing permissions. Keep
both filenames unchanged. Repeat for each lesson, then reopen the lesson in
TutIn. No course re-import is required. The generator never changes or uploads
your video; upload the generated sidecar yourself. Existing output is never
overwritten automatically.

## Playback and caching

The app uses your existing read-only Drive connection (or optional API key) to
find the matching sidecar. After playback has at least thirty seconds buffered,
or while paused and ready, it fetches the small sidecar at low priority. It
cancels preview requests if playback stalls, seeks, or the page becomes hidden.
Hover only reads cached images. Missing or inaccessible previews leave the
timestamp visible and never block playback, resume, or statistics.

Previews are cached in this browser for up to thirty days, sharing the existing
32 MB preview cache budget. Clearing the preview cache allows updated sidecars
to be downloaded. Each bundle is capped at 16 MB; unusually long videos may
need splitting. A different browser/device downloads its own image cache.
Video bytes still travel directly from Google to your browser. No Cloudflare
video relay, paid storage, or automatic Drive writes are introduced.

Generation decodes the local file once at low resolution. It can take time and
use CPU, so run it outside a study session if your computer is busy. The app
does not automatically generate previews for every existing Drive course.
