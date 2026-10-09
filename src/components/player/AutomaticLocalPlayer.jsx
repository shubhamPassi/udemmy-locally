import {forwardRef,lazy,Suspense,useEffect,useRef,useState} from 'react'
import {isLocalFileHandle,restoreLocalCourse} from '../../utils/automaticLocalFiles'
import {pickBrowserFolder} from '../../utils/browserFiles'
import {IS_BROWSER_MODE} from '../../utils/api'
const LocalVideoPlayer=lazy(()=>import('./VideoPlayer'))
const AutomaticLocalPlayer=forwardRef(function AutomaticLocalPlayer(props,ref){
    const [resolved,setResolved]=useState(null),[loading,setLoading]=useState(true),[access,setAccess]=useState(null),[error,setError]=useState(''),[recoveryNonce,setRecoveryNonce]=useState(0)
    const generation=useRef(0)
    useEffect(()=>{
        const token=++generation.current
        setLoading(true);setError('');setAccess(null)
        async function run(){
            if(!IS_BROWSER_MODE){setResolved(props.video);setLoading(false);return}
            try{
                const handle=props.video.fileHandle
                if(isLocalFileHandle(handle)&&await handle.queryPermission({mode:'read'})==='granted'){
                    try{
                        await handle.getFile()
                        if(generation.current===token){setResolved(props.video);setLoading(false)}
                        return
                    }catch{/* Recover the file from its remembered course folder. */}
                }
                const result=await restoreLocalCourse(props.courseId,null,props.video.id)
                if(generation.current!==token)return
                const video=result.content?.videos?.find(video=>video.id===props.video.id)
                if(isLocalFileHandle(video?.fileHandle))setResolved(video)
                else{setResolved(null);setAccess(result)}
            }catch(err){if(generation.current===token){setResolved(null);setAccess({missing:true});setError(err.message)}}
            finally{if(generation.current===token)setLoading(false)}
        }
        run();return()=>{generation.current++}
    },[props.video.id,props.video.fileAccessUpdatedAt,props.courseId,recoveryNonce])
    async function allowFolder(){
        setError('')
        try{
            let handle=access?.permissionHandle
            // Permission and picker calls run directly from this user gesture.
            if(handle){if(await handle.requestPermission({mode:'read'})!=='granted')throw Error('Folder access was not granted.');}
            else handle=await pickBrowserFolder()
            setLoading(true)
            const result=await restoreLocalCourse(props.courseId,handle,props.video.id)
            const video=result.content?.videos?.find(video=>video.id===props.video.id)
            if(!isLocalFileHandle(video?.fileHandle))throw Error(`This folder does not contain the selected lesson. Choose ${access?.folderName||'the original course folder'}.`)
            setResolved(video);setAccess(null)
        }catch(err){if(err.name!=='AbortError')setError(err.message)}finally{setLoading(false)}
    }
    const spinner=<div role="status" aria-label="Loading video" className="absolute inset-0 flex items-center justify-center bg-black"><span className="h-11 w-11 rounded-full border-4 border-white/20 border-t-white animate-spin"/></div>
    if(loading)return spinner
    if(access&&!window.showDirectoryPicker&&!access.permissionHandle)return <div className="absolute inset-0 flex items-center justify-center bg-black p-6 text-center text-sm text-neutral-400">This browser cannot open desktop course folders. Use a Drive or YouTube course on this device.</div>
    if(access)return <div className="absolute inset-0 flex items-center justify-center bg-black p-6 text-white"><div className="max-w-md text-center"><h3 className="font-semibold">Local folder access required</h3><p className="mt-3 text-sm leading-6 text-neutral-400">{access.permissionHandle?'Allow this browser to access the saved folder again.':'Choose the original course folder once. It will be remembered for automatic recovery.'}</p>{access.folderName&&<p className="mt-2 break-words text-xs text-neutral-400">{access.folderName}</p>}<button onClick={allowFolder} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm">{access.permissionHandle?'Allow folder access':'Choose course folder'}</button>{error&&<p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}</div></div>
    const playable={...resolved,...props.video,fileHandle:resolved?.fileHandle||props.video.fileHandle,filePath:resolved?.filePath||props.video.filePath,fileAccessUpdatedAt:resolved?.fileAccessUpdatedAt||props.video.fileAccessUpdatedAt}
    return <Suspense fallback={spinner}><LocalVideoPlayer key={`${playable.id}:${playable.fileAccessUpdatedAt||''}`} ref={ref} {...props} video={playable} onLocalAccessError={()=>setRecoveryNonce(value=>value+1)}/></Suspense>
})
export default AutomaticLocalPlayer
