export function localStorageBytes(storage) {
    if(!storage)return 0
    try{return Object.keys(storage).reduce((bytes,key)=>{
        const value=storage.getItem(key)
        return typeof value==='string'?bytes+2*(key.length+value.length):bytes
    },0)}catch{return 0}
}
export const isLocalStorageTight=bytes=>bytes>=4*1024*1024
