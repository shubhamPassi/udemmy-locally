export function playerShortcut(event) {
    const target = event.target
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
        target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="dialog"]')) return null
    const key = event.key.toLowerCase()
    if (key === ' ' && target?.closest?.('button, a, [role="button"]')) return null
    if (event.shiftKey && key === 'n') return { type: 'next' }
    if (event.shiftKey && key === 'p') return { type: 'previous' }
    if (key === '>' || key === '<') return { type: 'speed', value: key === '>' ? 1 : -1 }
    if (event.shiftKey) return null
    if (/^[0-9]$/.test(key)) return { type: 'percent', value: Number(key) / 10 }
    return ({
        ' ': { type: 'toggle' }, k: { type: 'toggle' },
        j: { type: 'seek', value: -10 }, l: { type: 'seek', value: 10 },
        arrowleft: { type: 'seek', value: -5 }, arrowright: { type: 'seek', value: 5 },
        arrowup: { type: 'volume', value: 0.05 }, arrowdown: { type: 'volume', value: -0.05 },
        m: { type: 'mute' }, f: { type: 'fullscreen' },
        ',': { type: 'frame', value: -1 / 30 }, '.': { type: 'frame', value: 1 / 30 },
        home: { type: 'percent', value: 0 }, end: { type: 'percent', value: 1 },
    })[key] || null
}
