// Public Drive files are read in bounded ranges so the native browser player can seek.
// Video bytes are cacheable in the viewer's browser; no whole-file download is buffered.
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
const CHUNK_SIZE = 4 * 1024 * 1024
export default async function handler(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
    const { id } = req.query
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,160}$/.test(id)) return res.status(400).json({ error: 'Invalid public Drive file ID' })
    const match = (req.headers.range || 'bytes=0-').match(/^bytes=(\d+)-(\d*)$/)
    if (!match) return res.status(416).end()
    const start = Number(match[1])
    if (!Number.isSafeInteger(start)) return res.status(416).end()
    // Fetch only metadata-sized data initially, then amortize request overhead with 4 MB ranges.
    const size = start === 0 ? 1024 * 1024 : CHUNK_SIZE
    const end = req.method === 'HEAD' ? start : Math.min(match[2] ? Number(match[2]) : start + size - 1, start + size - 1)
    if (!Number.isSafeInteger(end) || end < start) return res.status(416).end()
    let upstream
    try {
        upstream = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, {
            headers: { Range: `bytes=${start}-${end}` }, signal: AbortSignal.timeout(20000),
        })
        if (upstream.status === 416) { await upstream.body?.cancel(); return res.status(416).end() }
        if (upstream.status !== 206 || !upstream.headers.get('content-type')?.startsWith('video/')) {
            await upstream.body?.cancel()
            return res.status(422).json({ error: 'This Drive file does not allow public video downloads.' })
        }
        res.setHeader('Content-Type', upstream.headers.get('content-type'))
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Content-Range', upstream.headers.get('content-range'))
        res.setHeader('Cache-Control', 'private, max-age=86400')
        res.setHeader('Vary', 'Range')
        if (req.method === 'HEAD') { await upstream.body.cancel(); return res.status(206).end() }
        const length = Number(upstream.headers.get('content-length'))
        if (!Number.isFinite(length) || length < 1 || length > size) throw new Error('Drive returned an invalid range')
        res.setHeader('Content-Length', length)
        res.status(206)
        return await pipeline(Readable.fromWeb(upstream.body), res)
    } catch {
        await upstream?.body?.cancel().catch(() => {})
        if (res.headersSent || res.destroyed) return
        res.setHeader('Cache-Control', 'no-store')
        return res.status(502).json({ error: 'Could not stream this public Drive video. Please retry.' })
    }
}
