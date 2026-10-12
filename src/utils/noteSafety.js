import createDOMPurify from 'dompurify'
const options = {
    ALLOWED_TAGS: ['p','br','div','span','strong','b','em','i','u','s','strike','ul','ol','li','blockquote','pre','code','h1','h2','h3','a','img'],
    ALLOWED_ATTR: ['href','src','alt','title'],
    ALLOW_DATA_ATTR: false,
}
const purifiers=new WeakMap()
export function sanitizeNoteHtml(value, dom = typeof window === 'undefined' ? null : window) {
    if (typeof value !== 'string') return ''
    if (!dom?.document) return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    let purify=purifiers.get(dom)
    if(!purify){purify=createDOMPurify(dom);purifiers.set(dom,purify)}
    return purify.sanitize(value, options)
}
