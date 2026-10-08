export function fitRoadmapViewport(nodes, width, height) {
    if (!nodes.length) return { zoom: 1, pan: { x: 0, y: 0 } }
    const left = Math.min(...nodes.map(node => node.x))
    const top = Math.min(...nodes.map(node => node.y))
    const right = Math.max(...nodes.map(node => node.x + node.width))
    const bottom = Math.max(...nodes.map(node => node.y + node.height))
    const zoom = Math.min(1, Math.max(0.25, Math.min((width - 96) / (right - left), (height - 96) / (bottom - top))))
    return { zoom, pan: { x: width / 2 - (left + right) / 2 * zoom, y: height / 2 - (top + bottom) / 2 * zoom } }
}
