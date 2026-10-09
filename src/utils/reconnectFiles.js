function normalizedPath(value) {
    if(typeof value!=='string')return ''
    try{value=decodeURIComponent(value)}catch{}
    return value.normalize('NFKC').replace(/\\/g,'/').replace(/^file:\/\//i,'').replace(/\/+/g,'/').trim().toLowerCase()
}
const baseName=value=>normalizedPath(value).split('/').pop()||''
const stem=value=>baseName(value).replace(/\.[^.]+$/,'').replace(/^\d+[\s._-]+/,'').replace(/\s+/g,' ').trim()

function relativePath(value,root) {
    const path=normalizedPath(value),prefix=normalizedPath(root).replace(/\/$/,'')
    if(!prefix)return path
    if(path.startsWith(prefix+'/'))return path.slice(prefix.length+1)
    const rootName=prefix.split('/').pop()
    const marker='/'+rootName+'/'
    const index=path.lastIndexOf(marker)
    return index>=0?path.slice(index+marker.length):path
}
function indexAdd(index,key,file){
    if(!key)return
    const values=index.get(key)||[]
    if(!values.includes(file))values.push(file)
    index.set(key,values)
}
function unique(index,key){const values=index.get(key);return values?.length===1?values[0]:null}

export function createReconnectMatcher(scanned,{originalRoot,selectedRoot}={}) {
    const paths=new Map(),relative=new Map(),suffixes=new Map(),names=new Map(),titles=new Map()
    for(const file of scanned){
        const path=normalizedPath(file.filePath||file.relativePath)
        indexAdd(paths,path,file)
        indexAdd(relative,relativePath(path,selectedRoot),file)
        indexAdd(suffixes,path.split('/').slice(-2).join('/'),file)
        for(const name of [file.fileName,file.originalTitle,baseName(path)])indexAdd(names,baseName(name),file)
        for(const title of [file.title,file.fileName,file.originalTitle,baseName(path)])indexAdd(titles,stem(title),file)
    }
    return existing=>{
        const path=normalizedPath(existing.filePath||existing.relativePath)
        const precise=unique(paths,path)||unique(relative,relativePath(path,originalRoot))||unique(suffixes,path.split('/').slice(-2).join('/'))
        if(precise)return precise
        for(const name of [existing.fileName,existing.originalTitle,baseName(path)]){
            const match=unique(names,baseName(name));if(match)return match
        }
        // Legacy backups may retain only cleaned titles. Use those only when
        // exactly one file matches, so duplicate lesson names never guess.
        for(const title of [existing.title,existing.originalTitle,existing.fileName]){
            const match=unique(titles,stem(title));if(match)return match
        }
        return null
    }
}
export function matchReconnectFile(existing,scanned,options) {
    return createReconnectMatcher(scanned,options)(existing)
}
