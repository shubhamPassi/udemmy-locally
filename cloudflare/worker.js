import publicImport from '../api/public-import.js'

function json(body, status = 200, headers = {}) {
    return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } })
}

export default {
    async fetch(request, env, context) {
        const url = new URL(request.url)
        if (url.pathname === '/api/health') return json({ status: 'ok', hosting: 'cloudflare', drivePlayback: 'google-to-browser', videoRelay: false, videoRedirect: false })
        if (url.pathname === '/api/drive-video') {
            return json({ error: 'Video relays and redirects have been removed. The custom player connects directly to Google Drive.' }, 410)
        }
        if (url.pathname === '/api/public-import') {
            if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET' })
            const query = Object.fromEntries(['provider', 'id', 'type'].map(key => [key, url.searchParams.get(key) || (key === 'type' ? 'playlist' : '')]))
            const cacheKey = new Request(`${url.origin}${url.pathname}?${new URLSearchParams(query)}`)
            const cache = globalThis.caches?.default
            const cached = await cache?.match(cacheKey).catch(() => undefined)
            if (cached) return cached
            let status = 200, result
            const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' }
            const response = {
                setHeader(name, value) { headers[name] = value },
                status(code) { status = code; return this },
                json(body) { result = json(body, status, headers); return result },
            }
            try {
                await publicImport({ method: request.method, query }, response)
                if (result?.ok && cache && context?.waitUntil) {
                    // Cache public metadata only, never video bytes or browser progress.
                    result.headers.set('Cache-Control', 'public, max-age=300')
                    context.waitUntil(cache.put(cacheKey, result.clone()).catch(() => {}))
                }
                return result || json({ error: 'Import did not return a result' }, 502)
            } catch {
                return json({ error: 'Public import is temporarily unavailable. Please retry.' }, 502)
            }
        }
        if (url.pathname.startsWith('/api/')) return json({ error: 'Unknown API endpoint' }, 404)
        return env.ASSETS.fetch(request)
    },
}
