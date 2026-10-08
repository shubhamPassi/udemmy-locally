const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export function normalizeImageUrl(input) {
    let url
    try { url = new URL(String(input).trim().replace(/\\&/g, '&')) } catch {
        throw new Error('Enter a valid image URL starting with http:// or https://')
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Enter a valid image URL starting with http:// or https://')
    }
    if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) {
        const imageUrl = url.searchParams.get('imgurl')
        if (imageUrl) return normalizeImageUrl(imageUrl)
        throw new Error('This is a Google search page. Copy the image address, or upload the image instead.')
    }
    return url.href
}

function validateRemoteImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image()
        const timer = setTimeout(() => finish(new Error('Image took too long to load. Try uploading it instead.')), 15000)
        function finish(error) {
            clearTimeout(timer)
            image.onload = image.onerror = null
            if (error) { image.src = ''; reject(error) } else resolve({ imageSrc: url })
        }
        image.referrerPolicy = 'no-referrer'
        image.onload = () => finish(image.naturalWidth ? null : new Error('This URL did not load an image.'))
        image.onerror = () => finish(new Error('Cannot load this image. Use a direct image address or upload it instead.'))
        image.src = url
    })
}

export async function loadBrowserImage(input) {
    const url = normalizeImageUrl(input)
    let response
    try {
        response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) })
    } catch {
        // Images can be displayed even when their host disallows cross-origin downloads.
        return validateRemoteImage(url)
    }
    if (!response.ok) throw new Error('Cannot download this image. Try another image address or upload it instead.')
    const type = response.headers.get('content-type')?.split(';')[0]
    if (!type?.startsWith('image/')) throw new Error('This URL points to a page, not an image. Copy the image address instead.')
    const reader = response.body.getReader()
    const parts = []
    let size = 0
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_IMAGE_BYTES) {
            await reader.cancel()
            throw new Error('Thumbnail must be smaller than 2 MB. Upload a smaller image instead.')
        }
        parts.push(value)
    }
    if (!size) throw new Error('This image file is empty.')
    const blob = new Blob(parts, { type })
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve({ base64: reader.result })
        reader.onerror = () => reject(new Error('Could not save the image in this browser.'))
        reader.readAsDataURL(blob)
    })
}
