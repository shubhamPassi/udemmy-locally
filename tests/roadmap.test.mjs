import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import { request } from '../src/utils/browserStore.js'
import { fitRoadmapViewport } from '../src/utils/roadmapLayout.js'

test('fits separated course cards into the available canvas', () => {
    const nodes = [{ x: -100, y: 40, width: 280, height: 160 }, { x: 800, y: 300, width: 280, height: 160 }]
    const { zoom, pan } = fitRoadmapViewport(nodes, 800, 500)
    for (const node of nodes) {
        assert.ok(node.x * zoom + pan.x >= 47)
        assert.ok((node.x + node.width) * zoom + pan.x <= 753)
        assert.ok(node.y * zoom + pan.y >= 47)
        assert.ok((node.y + node.height) * zoom + pan.y <= 453)
    }
    assert.deepEqual(fitRoadmapViewport([], 800, 500), { zoom: 1, pan: { x: 0, y: 0 } })
})

test('removing the last roadmap card stays saved and deleting a roadmap preserves its courses', async () => {
    await request('POST', '/api/courses', { id: 'roadmap-course', title: 'Course' })
    await request('POST', '/api/roadmaps', { id: 'plan', title: 'My learning path', nodes: [{ id: 'card', courseId: 'roadmap-course' }], connections: [] })
    await request('PUT', '/api/roadmaps/plan', { nodes: [], connections: [] })
    assert.deepEqual((await request('GET', '/api/roadmaps')).find(r => r.id === 'plan').nodes, [])
    await request('DELETE', '/api/roadmaps/plan')
    assert.ok((await request('GET', '/api/courses')).some(c => c.id === 'roadmap-course'))
    assert.ok(!(await request('GET', '/api/roadmaps')).some(r => r.id === 'plan'))
})
