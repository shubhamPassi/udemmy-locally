export const cleanInstructorName = name => String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ')
export const instructorKey = name => cleanInstructorName(name).toLowerCase()
export function canonicalInstructor(name, courses) {
    const key = instructorKey(name)
    const existing = courses.find(course => key && instructorKey(course.instructor) === key)
    return cleanInstructorName(existing?.instructor || name)
}
export function normalizeCourseInstructors(courses) {
    const names = new Map()
    return courses.map(course => {
        const key = instructorKey(course.instructor)
        if (!key) return course
        if (!names.has(key)) names.set(key, cleanInstructorName(course.instructor))
        return { ...course, instructor: names.get(key) }
    })
}
