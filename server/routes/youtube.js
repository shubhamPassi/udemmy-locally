import express from 'express'
import { importYouTubeTranscript } from '../../api/public-import.js'

const router = express.Router()

router.get('/transcript', async (req, res) => {
    try {
        const { videoId, lang } = req.query

        if (!videoId) {
            return res.status(400).json({ error: 'videoId is required' })
        }

        const {chunks} = await importYouTubeTranscript(videoId, lang && lang !== 'none' ? lang : undefined)

        res.json({ chunks })

    } catch (err) {
        console.error('[YouTube API] Route error:', err)
        res.status(500).json({ error: err.message })
    }
})

export default router
