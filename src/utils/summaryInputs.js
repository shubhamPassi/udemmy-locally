export function summaryModel(model){
    if(!model||model==='google/gemini-2.0-flash-exp:free')return 'openrouter/free'
    if(model==='openrouter/free'||model.endsWith(':free'))return model
    throw Error('Choose a free model in Settings → AI & API Keys. Paid models are disabled for summaries.')
}
export function summaryConfiguration(apiKey,model){
    if(!apiKey?.trim())throw Error('Add an OpenRouter API key in Settings → AI & API Keys to generate an AI summary. The default model uses free inference.')
    return {apiKey:apiKey.trim(),model:summaryModel(model)}
}
export function summaryTranscript(video,cues=[]){
    if(typeof video?.transcript==='string'&&video.transcript.trim())return video.transcript.trim()
    const chunks=Array.isArray(video?.captionChunks)&&video.captionChunks.length?video.captionChunks:Array.isArray(cues)?cues:[]
    return chunks.map(cue=>typeof cue?.text==='string'?cue.text:'').join(' ').trim()
}
export async function requestAISummary(prompt,apiKey,model,onProgress,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
    const config=summaryConfiguration(apiKey,model)
    for(let attempt=0;attempt<3;attempt++){
        const response=await fetcher('https://openrouter.ai/api/v1/chat/completions',{
            method:'POST',signal:AbortSignal.timeout(60000),
            headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
            body:JSON.stringify({model:config.model,messages:[{role:'user',content:prompt}],max_tokens:2000,temperature:0.3})
        })
        if(response.status===429&&attempt<2){onProgress?.({stage:'summarizing',progress:0.3,message:'Free model is busy. Retrying…'});await wait((attempt+1)*4000);continue}
        const data=await response.json().catch(()=>({}))
        if(!response.ok){
            if(response.status===401)throw Error('OpenRouter rejected the API key. Update it in Settings → AI & API Keys.')
            if(response.status===429)throw Error('The free AI model is rate-limited. Try again later; your transcript is saved.')
            throw Error(data.error?.message||`AI summary request failed (${response.status}).`)
        }
        const summary=data.choices?.[0]?.message?.content?.trim()
        if(!summary)throw Error('The AI provider returned an empty summary. Please retry.')
        return summary
    }
}
