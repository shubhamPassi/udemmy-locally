import { useEffect, useState } from 'react'
import { getAllCourses } from '../../utils/db'
import { canonicalInstructor, instructorKey } from '../../utils/instructorNames'

export default function InstructorPicker({ value, onChange }) {
    const [courses,setCourses]=useState([]),[adding,setAdding]=useState(false)
    useEffect(()=>{let active=true;getAllCourses().then(rows=>{if(active)setCourses(rows)}).catch(()=>{});return()=>{active=false}},[])
    const names=[...new Set(courses.map(course=>course.instructor).filter(Boolean))].sort((a,b)=>a.localeCompare(b))
    const existing=names.find(name=>instructorKey(name)===instructorKey(value))
    const isNew=adding || (!!value&&!existing)
    const classes='w-full rounded-lg border border-light-border dark:border-dark-border bg-white dark:bg-dark-bg px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
    return <div className="space-y-2">
        <select aria-label="Choose instructor" value={isNew?'__new':existing||''} onChange={event=>{
            if(event.target.value==='__new'){setAdding(true);onChange('')}
            else{setAdding(false);onChange(event.target.value)}
        }} className={classes}>
            <option value="">No instructor</option>
            {names.map(name=><option key={name} value={name}>{name}</option>)}
            <option value="__new">+ Add new instructor</option>
        </select>
        {isNew&&<><input aria-label="New instructor name" placeholder="Enter new instructor name" maxLength={100} value={value||''} onChange={event=>onChange(event.target.value)} onBlur={()=>{const name=canonicalInstructor(value,courses);onChange(name);if(names.includes(name))setAdding(false)}} className={classes}/><p className="text-xs text-neutral-500">Matching names use the existing instructor automatically.</p></>}
    </div>
}
