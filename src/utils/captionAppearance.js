export const defaultCaptionAppearance = { size: 22, background: 'dark', version: 2 }

export function captionAppearance(saved) {
    const size = [14,18,22,26,32].includes(saved?.size) ? saved.size : 22
    // The old 26px default was oversized in the embedded player. Retain
    // deliberate smaller/larger choices while updating that legacy default.
    return { size: !saved?.version && size === 26 ? 22 : size, background: saved?.background === 'transparent' ? 'transparent' : 'dark', version: 2 }
}

export function captionFontSize(size, height) {
    return Math.round(Math.max(14, Math.min(size * 1.25, size * Math.max(0.65, (height || 540) / 540))))
}

export function balancedCaption(text) {
    const clean = String(text || '').replace(/\s+/g,' ').trim()
    if (clean.length <= 54) return clean
    const words = clean.split(' ')
    if (words.length < 2) return clean
    // Avoid a long first line followed by one orphaned word. The browser can
    // still wrap either line further on a narrow/mobile video viewport.
    let best = 1, difference = Infinity, length = words[0].length
    for (let index=1;index<words.length;index++) {
        const delta = Math.abs(length - (clean.length-length-1))
        if (delta < difference) { best=index;difference=delta }
        length += words[index].length+1
    }
    return words.slice(0,best).join(' ')+'\n'+words.slice(best).join(' ')
}
