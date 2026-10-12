export function downloadText(text, filename, type='text/plain;charset=utf-8') {
    const url=URL.createObjectURL(new Blob([text],{type})),link=document.createElement('a')
    link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove()
    setTimeout(()=>URL.revokeObjectURL(url),1000)
}
