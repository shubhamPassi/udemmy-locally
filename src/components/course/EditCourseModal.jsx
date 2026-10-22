import useModalFocus from '../../hooks/useModalFocus'
import InstructorPicker from './InstructorPicker'
import { useState, useRef, useEffect } from 'react'
import { X, Upload, Image, Trash2, Folder, Video, Clock, Link2, Loader2, Search, ClipboardPaste } from 'lucide-react'
import { updateCourse, formatDuration } from '../../utils/db'
import * as api from '../../utils/api'

import { validateCourseTitle, sanitizeHTML } from '../../utils/validation'

function EditCourseModal({ course, isOpen, onClose, onSave }) {
    const modalHost=useRef(null)
    useModalFocus(isOpen,modalHost,onClose)
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        instructor: '',
        tags: [],
        thumbnailData: null,
        courseUrl: '',
        totalModules: '',
        totalVideos: '',
        hours: '',
        minutes: '',
        completedVideos: ''
    })
    const [newTag, setNewTag] = useState('')
    const [thumbnailUrl, setThumbnailUrl] = useState('')
    const [isDownloadingThumbnail, setIsDownloadingThumbnail] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [errors, setErrors] = useState({})
    const [isDragging, setIsDragging] = useState(false)
    const [imageSearchOpened, setImageSearchOpened] = useState(false)
    const fileInputRef = useRef(null)

    useEffect(() => {
        if (course && isOpen) {
            setFormData({
                title: course.title || '',
                description: course.description || '',
                instructor: course.instructor || '',
                tags: course.tags || [],
                thumbnailData: course.thumbnailData || null,
                courseUrl: course.courseUrl || '',
                totalVideos: course.totalVideos || '',
                totalModules: course.customMetadata?.totalModules || '',
                hours: course.totalDuration ? Math.floor(course.totalDuration / 3600) : '',
                minutes: course.totalDuration ? Math.floor((course.totalDuration % 3600) / 60) : '',
                completedVideos: course.completedVideos || 0,
            })
            setErrors({})
            setNewTag('')
            setThumbnailUrl('')
            setImageSearchOpened(false)
        }
    }, [course, isOpen])

    if (!isOpen || !course) return null
    
    const isExternalCourse = course.sourceType === 'external-link' || !!course.courseUrl

    function handleChange(field, value) {
        setFormData(prev => ({ ...prev, [field]: value }))
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: null }))
        }
    }

    async function handleThumbnailUpload(file) {
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setErrors(prev => ({ ...prev, thumbnail: 'Please select an image file' }))
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setErrors(prev => ({ ...prev, thumbnail: 'Image must be less than 5MB' }))
            return
        }

        try {
            const compressed = await compressImage(file, 200 * 1024)
            setFormData(prev => ({ ...prev, thumbnailData: compressed }))
            setErrors(prev => ({ ...prev, thumbnail: null }))
        } catch {
            setErrors(prev => ({ ...prev, thumbnail: 'Failed to process image' }))
        }
    }

    async function compressImage(file, maxSizeBytes) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = (e) => {
                const img = new window.Image()
                img.onload = () => {
                    const canvas = document.createElement('canvas')
                    let width = img.width
                    let height = img.height
                    const maxDimension = 800
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = (height / width) * maxDimension
                            width = maxDimension
                        } else {
                            width = (width / height) * maxDimension
                            height = maxDimension
                        }
                    }
                    canvas.width = width
                    canvas.height = height
                    const ctx = canvas.getContext('2d')
                    ctx.drawImage(img, 0, 0, width, height)
                    let quality = 0.9
                    let result = canvas.toDataURL('image/jpeg', quality)
                    while (result.length > maxSizeBytes * 1.37 && quality > 0.1) {
                        quality -= 0.1
                        result = canvas.toDataURL('image/jpeg', quality)
                    }
                    resolve(result)
                }
                img.onerror = reject
                img.src = e.target.result
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
        })
    }

    function handleDragOver(e) {
        e.preventDefault()
        setIsDragging(true)
    }

    function handleDragLeave(e) {
        e.preventDefault()
        setIsDragging(false)
    }

    function handleDrop(e) {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) handleThumbnailUpload(file)
    }

    function handleFileInputChange(e) {
        const file = e.target.files?.[0]
        if (file) handleThumbnailUpload(file)
    }

    function removeThumbnail() {
        setFormData(prev => ({ ...prev, thumbnailData: null }))
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    function browseImages() {
        const title = formData.title.trim()
        if (!title) { setErrors(prev => ({ ...prev, thumbnail: 'Enter the course title before searching for images.' })); return }
        const popup = window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(title)}`, 'course-thumbnail-search', 'popup=yes,width=1000,height=750,scrollbars=yes,resizable=yes')
        if (!popup) { setErrors(prev => ({ ...prev, thumbnail: 'Allow pop-ups for this site to browse Google Images.' })); return }
        popup.opener = null
        setImageSearchOpened(true)
        setErrors(prev => ({ ...prev, thumbnail: null }))
    }

    async function pasteImageUrl() {
        try {
            const text = (await navigator.clipboard.readText()).trim()
            if (!/^https?:\/\/\S+$/i.test(text)) throw new Error('In Google Images, right-click the image and choose Copy image address.')
            setThumbnailUrl(text)
            setErrors(prev => ({ ...prev, thumbnail: null }))
        } catch (error) {
            setErrors(prev => ({ ...prev, thumbnail: error.message || 'Paste the copied image address into the URL field with Ctrl+V / Cmd+V.' }))
        }
    }

    async function handleThumbnailUrlDownload() {
        const url = thumbnailUrl.trim()
        if (!/^https?:\/\/\S+/i.test(url)) {
            setErrors(prev => ({ ...prev, thumbnail: 'Enter a valid image URL starting with http:// or https://' }))
            return
        }

        try {
            setIsDownloadingThumbnail(true)
            const result = await api.post('/api/data/download-image', { url })
            const imageSrc = result?.base64 || result?.imageSrc
            if (!imageSrc) {
                throw new Error('Downloaded file was not an image')
            }
            setFormData(prev => ({ ...prev, thumbnailData: imageSrc }))
            setThumbnailUrl('')
            setErrors(prev => ({ ...prev, thumbnail: null }))
        } catch (err) {
            console.error('Failed to download thumbnail:', err)
            setErrors(prev => ({ ...prev, thumbnail: err.message || 'Failed to download image from URL' }))
        } finally {
            setIsDownloadingThumbnail(false)
        }
    }

    function handleAddTag() {
        const tag = newTag.trim()
        if (tag && !formData.tags.includes(tag) && formData.tags.length < 10) {
            setFormData(prev => ({ ...prev, tags: [...prev.tags, sanitizeHTML(tag)] }))
            setNewTag('')
        }
    }

    function handleRemoveTag(tagToRemove) {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }))
    }

    function handleTagKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddTag()
        }
    }

    async function handleSave() {
        const titleValidation = validateCourseTitle(formData.title)
        if (!titleValidation.valid) {
            setErrors({ title: titleValidation.error })
            return
        }

        try {
            setIsSaving(true)
            
            const updateData = {
                title: titleValidation.sanitized,
                description: sanitizeHTML(formData.description),
                instructor: sanitizeHTML(formData.instructor),
                tags: formData.tags,
                thumbnailData: formData.thumbnailData,
                updatedAt: new Date().toISOString()
            }
            
            if (isExternalCourse) {
                if (!formData.courseUrl?.trim()) {
                    setErrors({ courseUrl: 'Course URL is required' })
                    setIsSaving(false)
                    return
                }
                updateData.courseUrl = formData.courseUrl.trim()
                
                const hours = parseInt(formData.hours) || 0
                const minutes = parseInt(formData.minutes) || 0
                updateData.totalDuration = (hours * 3600) + (minutes * 60)
                
                updateData.totalVideos = Math.max(parseInt(formData.totalVideos) || 1, 1)
                updateData.completedVideos = Math.max(0, Math.min(parseInt(formData.completedVideos) || 0, updateData.totalVideos))
                
                updateData.customMetadata = {
                    ...(course.customMetadata || {}),
                    totalModules: Math.max(parseInt(formData.totalModules) || 1, 1)
                }
                
                if (updateData.totalVideos > 0 && updateData.completedVideos >= 0) {
                    updateData.completionPercentage = Math.min((updateData.completedVideos / updateData.totalVideos) * 100, 100)
                } else {
                    updateData.completionPercentage = 0
                }
            }

            await updateCourse(course.id, updateData)
            onSave?.()
            onClose()
        } catch (err) {
            console.error('Failed to save course:', err)
            setErrors({ general: 'Failed to save changes.' })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            <div ref={modalHost} role="dialog" aria-modal="true" aria-label="Edit Course" className="relative bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col animate-scale-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
                    <h2 className="text-xl font-semibold">Edit Course</h2>
                    <button onClick={onClose} className="p-2 hover:bg-light-surface dark:hover:bg-dark-bg rounded-lg">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {errors.general && (
                        <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{errors.general}</div>
                    )}

                    {/* Thumbnail */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Thumbnail
                        </label>
                        <div className="flex items-start gap-4">
                            <div
                                className={`w-40 h-24 rounded-lg border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-primary-fg/40 bg-primary-fg/5' : 'border-light-border dark:border-dark-border hover:border-primary-fg/30'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {formData.thumbnailData ? (
                                    <img src={formData.thumbnailData} alt="Thumbnail" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center p-2">
                                        <Upload className="w-6 h-6 mx-auto text-light-text-secondary dark:text-dark-text-secondary" />
                                        <span className="text-xs text-light-text-secondary dark:text-dark-text-secondary">Drop or click</span>
                                    </div>
                                )}
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-light-border dark:border-dark-border px-3 py-2 text-sm"><Upload className="w-4 h-4" />Upload Image</button>
                                <button type="button" onClick={browseImages} className="inline-flex items-center gap-2 rounded-lg border border-light-border dark:border-dark-border px-3 py-2 text-sm"><Search className="w-4 h-4" />Browse images</button>
                                <button type="button" onClick={pasteImageUrl} className="inline-flex items-center gap-2 rounded-lg border border-light-border dark:border-dark-border px-3 py-2 text-sm"><ClipboardPaste className="w-4 h-4" />Paste image URL</button>
                                {formData.thumbnailData && <button type="button" onClick={removeThumbnail} className="text-sm text-error hover:underline flex items-center gap-1"><Trash2 className="w-3 h-3" />Remove</button>}
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <div className="relative flex-1 min-w-0">
                                <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-light-text-secondary dark:text-dark-text-secondary" />
                                <input
                                    type="url"
                                    value={thumbnailUrl}
                                    onChange={(e) => setThumbnailUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            handleThumbnailUrlDownload()
                                        }
                                    }}
                                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:border-primary dark:focus:border-blue-400 outline-none focus:outline-none ring-0 focus:ring-0"
                                    aria-label="Thumbnail image URL"
                                    placeholder="Paste image URL"
                                    disabled={isDownloadingThumbnail}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleThumbnailUrlDownload}
                                disabled={!thumbnailUrl.trim() || isDownloadingThumbnail}
                                className="px-3 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            >
                                {isDownloadingThumbnail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                                Use URL
                            </button>
                        </div>
                        {imageSearchOpened && <p className="mt-2 text-xs text-light-text-secondary dark:text-dark-text-secondary">In Google Images, right-click an image → Copy image address. Return here → Paste image URL → Use URL.</p>}
                        {errors.thumbnail && <p className="text-error text-sm mt-1">{errors.thumbnail}</p>}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Title *
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleChange('title', e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg border ${errors.title ? 'border-error' : 'border-light-border dark:border-dark-border'} bg-white dark:bg-dark-bg focus:border-primary dark:focus:border-blue-400 outline-none focus:outline-none ring-0 focus:ring-0`}
                            placeholder="Course title"
                            maxLength={200}
                        />
                        {errors.title && <p className="text-error text-sm mt-1">{errors.title}</p>}
                    </div>

                    {/* Instructor */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Instructor
                        </label>
                        <InstructorPicker value={formData.instructor} onChange={value => handleChange('instructor', value)} />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => handleChange('description', e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:border-primary dark:focus:border-blue-400 outline-none focus:outline-none ring-0 focus:ring-0 resize-none"
                            placeholder="Course description, notes, URLs..."
                            rows={4}
                            maxLength={2000}
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                className="flex-1 px-3 py-2 rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg focus:border-primary dark:focus:border-blue-400 outline-none focus:outline-none ring-0 focus:ring-0"
                                placeholder="Add a tag..."
                                maxLength={30}
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                disabled={!newTag.trim() || formData.tags.length >= 10}
                                className="px-4 py-2 bg-primary text-primary-content hover:bg-primary-hover rounded-lg hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Add
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {formData.tags.map((tag, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 dark:bg-primary/50/10 text-primary rounded-full text-sm"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                        className="hover:bg-blue-200 dark:hover:bg-primary/50/20 rounded-full p-0.5"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        {formData.tags.length >= 10 && (
                            <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-2">
                                Maximum 10 tags reached
                            </p>
                        )}
                    </div>

                    {/* Course Stats / External Metadata */}
                    {isExternalCourse ? (
                        <div className="space-y-4 p-4 border border-light-border dark:border-dark-border rounded-lg bg-light-surface/50 dark:bg-dark-bg/50">
                            <h3 className="font-medium text-sm">External Course Metadata</h3>
                            
                            {/* URL */}
                            <div>
                                <label className="block text-xs font-medium mb-1">Course URL *</label>
                                <input
                                    type="url"
                                    value={formData.courseUrl}
                                    onChange={(e) => handleChange('courseUrl', e.target.value)}
                                    className={`w-full px-2 py-1.5 text-sm rounded border ${errors.courseUrl ? 'border-error' : 'border-light-border dark:border-dark-border'} bg-white dark:bg-dark-bg focus:border-primary outline-none focus:ring-0`}
                                />
                                {errors.courseUrl && <p className="text-error text-xs mt-1">{errors.courseUrl}</p>}
                            </div>

                            <label className="block text-xs font-medium -mb-2 mt-4">Course Progress & Content</label>
                            <div className="flex items-center gap-6 p-4 bg-light-surface dark:bg-dark-bg/50 border border-light-border dark:border-dark-border rounded-lg flex-wrap">
                                {/* Modules */}
                                <div className="flex items-center gap-2">
                                    <Folder className="w-5 h-5 text-primary" />
                                    <input 
                                        type="number" 
                                        min="1"
                                        value={formData.totalModules} 
                                        onChange={(e) => handleChange('totalModules', e.target.value)}
                                        className="no-spinner w-12 bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus:border-primary flex-shrink-0 outline-none text-center font-medium transition-colors"
                                        placeholder="1"
                                    />
                                </div>
                                
                                {/* Videos */}
                                <div className="flex items-center gap-2">
                                    <Video className="w-5 h-5 text-primary" />
                                    <div className="flex items-center bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus-within:border-primary transition-colors">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={formData.completedVideos} 
                                            onChange={(e) => {
                                                const max = parseInt(formData.totalVideos) || 1;
                                                let val = parseInt(e.target.value);
                                                if (!isNaN(val) && val > max) {
                                                    handleChange('completedVideos', max.toString());
                                                } else {
                                                    handleChange('completedVideos', e.target.value);
                                                }
                                            }}
                                            className="no-spinner w-8 bg-transparent outline-none text-right font-medium text-primary"
                                            placeholder="0"
                                        />
                                        <span className="mx-0.5 font-medium text-gray-400">/</span>
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={formData.totalVideos} 
                                            onChange={(e) => handleChange('totalVideos', e.target.value)}
                                            className="no-spinner w-8 bg-transparent outline-none text-left font-medium"
                                            placeholder="1"
                                        />
                                    </div>
                                </div>
                                
                                {/* Duration */}
                                <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-primary" />
                                    <div className="flex items-center bg-white dark:bg-black/20 border border-light-border dark:border-dark-border rounded px-1 py-0.5 focus-within:border-primary transition-colors">
                                        <input 
                                            type="number" 
                                            min="0"
                                            value={formData.hours} 
                                            onChange={(e) => handleChange('hours', e.target.value)}
                                            className="no-spinner w-8 bg-transparent outline-none text-right font-medium"
                                            placeholder="0"
                                        />
                                        <span className="mx-0.5 font-medium text-gray-400">:</span>
                                        <input 
                                            type="number" 
                                            min="0"
                                            max="59"
                                            value={formData.minutes} 
                                            onChange={(e) => handleChange('minutes', e.target.value)}
                                            className="no-spinner w-8 bg-transparent outline-none text-left font-medium"
                                            placeholder="00"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 bg-light-surface dark:bg-dark-bg rounded-lg text-sm text-light-text-secondary dark:text-dark-text-secondary">
                            <div className="flex items-center gap-4">
                                <span>{course.totalVideos} videos</span>
                                <span>•</span>
                                <span>{formatDuration(course.totalDuration)}</span>
                                <span>•</span>
                                <span>{Math.round(course.completionPercentage || 0)}% complete</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-4 border-t border-light-border dark:border-dark-border">
                    <button onClick={onClose} className="px-4 py-2 text-sm border border-light-border dark:border-dark-border rounded-lg hover:bg-light-surface dark:hover:bg-dark-bg" disabled={isSaving}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={isSaving || !formData.title.trim()} className="px-4 py-2 text-sm bg-primary text-primary-content hover:bg-primary-hover rounded-lg hover:bg-gray-800 dark:hover:bg-white/20 disabled:opacity-50 flex items-center gap-2">
                        {isSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default EditCourseModal
