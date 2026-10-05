import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { scanCourseFolder } from './courseScanner.js'
import { addAllowedRoot } from './videoStreamer.js'
import { getAll, getOne, run, saveDatabaseSync, transaction } from '../database.js'

export const DEFAULT_LIBRARY_PATH = process.env.TUTIN_LIBRARY_PATH || ''

function generateId(prefix) {
    return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function normalizePathForCompare(value) {
    return path.resolve(value).toLowerCase()
}

function hasVideos(courseStructure) {
    return (courseStructure?.totalVideos || 0) > 0
}

function generateThumbnailData(videoPath) {
    const tempPath = path.join(os.tmpdir(), `tutin-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)

    try {
        execFileSync('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-ss', '5',
            '-i', videoPath,
            '-frames:v', '1',
            '-vf', 'scale=640:-1',
            tempPath,
        ], { timeout: 30000, windowsHide: true })

        if (!fs.existsSync(tempPath)) return null
        const image = fs.readFileSync(tempPath)
        return `data:image/jpeg;base64,${image.toString('base64')}`
    } catch (err) {
        console.warn(`[LibraryBootstrap] Thumbnail generation failed for ${videoPath}: ${err.message}`)
        return null
    } finally {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
        } catch {}
    }
}

function getExistingCoursePathSet() {
    const courses = getAll('SELECT id, folder_path FROM courses WHERE folder_path IS NOT NULL')
    return new Set(courses.map(course => normalizePathForCompare(course.folder_path)))
}

export function configureDefaultLibraryRoot() {
    if (!DEFAULT_LIBRARY_PATH) return null

    const libraryPath = path.resolve(DEFAULT_LIBRARY_PATH)

    run(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        ['root_folder_path', JSON.stringify(libraryPath), new Date().toISOString()]
    )

    addAllowedRoot(libraryPath)
    return libraryPath
}

export function pruneMissingLibraryCourses(libraryPath = DEFAULT_LIBRARY_PATH ? path.resolve(DEFAULT_LIBRARY_PATH) : null) {
    if (!libraryPath) return { removed: 0, removedCourses: [] }

    const courses = getAll(
        `SELECT id, title, folder_path FROM courses
         WHERE source_type = 'local' AND folder_path IS NOT NULL`
    )
    let removed = 0
    const removedCourses = []

    transaction(() => {
        for (const course of courses) {
            const relative = path.relative(libraryPath, course.folder_path)
            const isInsideLibrary = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))

            if (!isInsideLibrary || fs.existsSync(course.folder_path)) continue

            run('DELETE FROM courses WHERE id = ?', [course.id])
            removed++
            removedCourses.push({
                id: course.id,
                title: course.title,
                folderPath: course.folder_path,
            })
            console.log(`[LibraryBootstrap] Removed missing course: ${course.title} (${course.folder_path})`)
        }
    })

    return { removed, removedCourses }
}

function saveCourseStructure(courseStructure) {
    const now = new Date().toISOString()
    const courseId = generateId('course_')

    transaction(() => {
        run(`
            INSERT INTO courses (
                id, title, original_title, description, instructor, tags,
                thumbnail_data, folder_path, source_type, course_url,
                date_added, date_modified, last_accessed, last_accessed_click_time,
                total_duration, total_videos, completed_videos, completion_percentage,
                custom_metadata, "order"
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            courseId,
            courseStructure.title,
            courseStructure.originalTitle || null,
            '',
            '',
            '[]',
            courseStructure.thumbnailData || null,
            courseStructure.folderPath,
            'local',
            null,
            now,
            now,
            now,
            now,
            courseStructure.totalDuration || 0,
            courseStructure.totalVideos || 0,
            0,
            0,
            JSON.stringify({ autoImported: true }),
            0,
        ])

        saveModulesRecursive(courseStructure.modules || [], courseId, null)
    })

    return courseId
}

function saveModulesRecursive(modules, courseId, parentModuleId) {
    for (let i = 0; i < modules.length; i++) {
        const module = modules[i]
        const moduleId = generateId('module_')
        const now = new Date().toISOString()

        run(`
            INSERT INTO modules (
                id, course_id, parent_module_id, title, original_title,
                description, thumbnail_data, folder_path, "order",
                total_duration, total_videos, completed_videos, date_added
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            moduleId,
            courseId,
            parentModuleId,
            module.title,
            module.originalTitle || null,
            '',
            module.thumbnailData || null,
            module.folderPath || null,
            i,
            module.totalDuration || 0,
            module.totalVideos || module.videos?.length || 0,
            0,
            now,
        ])

        for (let j = 0; j < (module.videos || []).length; j++) {
            const video = module.videos[j]
            run(`
                INSERT INTO videos (
                    id, course_id, module_id, title, original_title, description,
                    file_name, file_path, file_size, duration, thumbnail_data,
                    "order", is_required, is_completed, is_favorite, watch_progress,
                    last_watched_position, tags, bookmarks, youtube_id, url, subtitle_sources
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                generateId('video_'),
                courseId,
                moduleId,
                video.title,
                video.originalTitle || null,
                '',
                video.fileName || '',
                video.filePath || null,
                video.fileSize || 0,
                video.duration || 0,
                video.thumbnailData || null,
                j,
                1,
                0,
                0,
                0,
                0,
                '[]',
                '[]',
                null,
                null,
                JSON.stringify(video.subtitleFiles || []),
            ])
        }

        if (module.subModules?.length) {
            saveModulesRecursive(module.subModules, courseId, moduleId)
        }
    }
}

export async function bootstrapLibrary(options = {}) {
    const {
        generateThumbnails = false,
        pruneMissing = true,
    } = options

    const libraryPath = configureDefaultLibraryRoot()
    if (!libraryPath) {
        saveDatabaseSync()
        return { libraryPath: null, imported: 0, skipped: 0, failed: 0, removed: 0, removedCourses: [] }
    }

    if (!fs.existsSync(libraryPath)) {
        console.warn(`[LibraryBootstrap] Library path not found: ${libraryPath}`)
        saveDatabaseSync()
        return { libraryPath, imported: 0, skipped: 0, failed: 0 }
    }

    const pruneResult = pruneMissing
        ? pruneMissingLibraryCourses(libraryPath)
        : { removed: 0, removedCourses: [] }

    const entries = fs.readdirSync(libraryPath, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

    const existingCoursePaths = getExistingCoursePathSet()

    let imported = 0
    let skipped = 0
    let failed = 0

    for (const entry of entries) {
        const folderPath = path.join(libraryPath, entry.name)
        const normalizedFolderPath = normalizePathForCompare(folderPath)
        addAllowedRoot(folderPath)

        if (existingCoursePaths.has(normalizedFolderPath)) {
            skipped++
            continue
        }

        try {
            const courseStructure = await scanCourseFolder(folderPath, undefined, false, { detectDurations: false })
            if (!hasVideos(courseStructure)) {
                skipped++
                continue
            }

            saveCourseStructure(courseStructure)
            existingCoursePaths.add(normalizedFolderPath)
            imported++
            console.log(`[LibraryBootstrap] Imported: ${courseStructure.title}`)
        } catch (err) {
            failed++
            console.warn(`[LibraryBootstrap] Skipped ${folderPath}: ${err.message}`)
        }
    }

    if (generateThumbnails) {
        ensureCourseThumbnails(libraryPath)
    }

    const existingRoot = getOne('SELECT value FROM settings WHERE key = ?', ['root_folder_path'])
    if (!existingRoot?.value) {
        console.warn('[LibraryBootstrap] root_folder_path setting was not persisted')
    }

    saveDatabaseSync()
    console.log(`[LibraryBootstrap] Library: ${libraryPath}; imported=${imported}; skipped=${skipped}; failed=${failed}; removed=${pruneResult.removed}`)
    return { libraryPath, imported, skipped, failed, ...pruneResult }
}

function ensureCourseThumbnails(libraryPath) {
    const courses = getAll(
        `SELECT id, title, folder_path, thumbnail_data FROM courses
         WHERE folder_path IS NOT NULL AND (thumbnail_data IS NULL OR thumbnail_data = '')`
    )

    let updated = 0

    for (const course of courses) {
        if (!course.folder_path) continue

        const relative = path.relative(libraryPath, course.folder_path)
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue

        const firstVideo = getOne(
            `SELECT file_path FROM videos
             WHERE course_id = ? AND file_path IS NOT NULL
             ORDER BY "order" ASC LIMIT 1`,
            [course.id]
        )

        if (!firstVideo?.file_path || !fs.existsSync(firstVideo.file_path)) continue

        const thumbnailData = generateThumbnailData(firstVideo.file_path)
        if (!thumbnailData) continue

        run('UPDATE courses SET thumbnail_data = ?, date_modified = ? WHERE id = ?', [
            thumbnailData,
            new Date().toISOString(),
            course.id,
        ])
        updated++
        console.log(`[LibraryBootstrap] Generated thumbnail: ${course.title}`)
    }

    if (updated > 0) {
        console.log(`[LibraryBootstrap] Generated ${updated} missing course thumbnails`)
    }
}
