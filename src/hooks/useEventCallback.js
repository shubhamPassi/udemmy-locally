import {useCallback,useRef} from 'react'
// Event listeners keep a stable identity while reading the latest render state.
export default function useEventCallback(callback){const latest=useRef(callback);latest.current=callback;return useCallback((...args)=>latest.current?.(...args),[])}
