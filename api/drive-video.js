// Retired: video bytes must never pass through a hosting function.
export default async function handler(_req, res) {
    res.setHeader('Cache-Control', 'no-store')
    return res.status(410).json({ error: 'Video relays have been removed. The custom player connects directly to Google Drive.' })
}
