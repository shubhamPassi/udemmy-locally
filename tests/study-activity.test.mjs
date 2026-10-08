import test from 'node:test'
import assert from 'node:assert/strict'
import { studyActivity, studyConsistency, studyReportCsv } from '../src/utils/studyActivity.js'

const courses = [{id:'a',title:'Course A'},{id:'b',title:'Course B'}]
const records = [
    {courseId:'a',hours:{'2026-10-08T09':120,'2026-10-08T10':60,'2026-10-07T23':30,'2026-09-30T10':100}},
    {courseId:'b',hours:{'2026-10-08T09':60,'2026-10-02T12':300,'2026-10-01T12':100}},
]
test('day totals retain course colors in each hourly stack and compare with yesterday', () => {
    const result=studyActivity(records,courses,new Date(2026,9,8),1)
    assert.equal(result.bins.length,24)
    assert.equal(result.totalSeconds,240)
    assert.equal(result.previousSeconds,30)
    assert.equal(result.bins[9].seconds,180)
    assert.deepEqual(result.bins[9].courses,{a:120,b:60})
    assert.equal(result.peak.index,9)
    assert.equal(result.rows.find(row=>row.id==='a').seconds,180)
})
test('week includes seven local dates and compares to the immediately preceding seven', () => {
    const result=studyActivity(records,courses,new Date(2026,9,8),7)
    assert.equal(result.bins.length,7)
    assert.equal(result.totalSeconds,570)
    assert.equal(result.previousSeconds,200)
    assert.equal(result.activeDays,3)
    assert.equal(result.averageSeconds,570/7)
    assert.equal(result.peak.date.getDate(),2)
})
test('past-day drilldown excludes other days and malformed records without inventing time', () => {
    const result=studyActivity([...records,{hours:{'2026-10-07T99':500,'2026-10-07T09':-1,'2026-10-07T10':Infinity}}],courses,new Date(2026,9,7),1)
    assert.equal(result.totalSeconds,30)
    assert.equal(result.bins[23].seconds,30)
    assert.equal(result.rows[0].title,'Course A')
})

test('streaks cross month boundaries, allow an unfinished today, and reset after a missed day', () => {
    const records=[{hours:{'2026-09-29T10':60,'2026-09-30T10':60,'2026-10-01T10':60,'2026-10-03T10':60,'2026-10-04T10':60,'2026-10-10T10':999}}]
    assert.deepEqual(studyConsistency(records,new Date(2026,9,5)),{currentStreak:2,bestStreak:3,studiedDays:5,totalSeconds:300})
    assert.equal(studyConsistency(records,new Date(2026,9,6)).currentStreak,0)
    assert.equal(studyConsistency([],new Date(2026,9,6)).bestStreak,0)
})

test('CSV reports export the chosen period and escape course names for spreadsheets', () => {
    const result=studyActivity(records,[{id:'a',title:'=SUM(1,2)'},{id:'b',title:'Course "B"'}],new Date(2026,9,8),1)
    const csv=studyReportCsv(result,1)
    assert.ok(csv.startsWith('\uFEFF"Date","Hour"'))
    assert.ok(csv.includes('"2026-10-08","09:00","\'=SUM(1,2)","0:02:00","120"'))
    assert.ok(csv.includes('"Course ""B"""'))
    assert.ok(!csv.includes('2026-10-02'))
    assert.equal(csv.split('\r\n').length,4)
})
