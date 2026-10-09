export async function compressThumbnail(source) {
    if(typeof document==='undefined'||!source?.startsWith('data:image/'))return source
    return new Promise(resolve=>{
        const image=new Image()
        image.onload=()=>{
            try{
                const scale=Math.min(1,1280/image.naturalWidth,720/image.naturalHeight)
                const canvas=document.createElement('canvas')
                canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale))
                canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height)
                const compressed=canvas.toDataURL('image/webp',0.8)
                resolve(compressed.length<source.length?compressed:source)
            }catch{resolve(source)}
        }
        image.onerror=()=>resolve(source);image.src=source
    })
}
