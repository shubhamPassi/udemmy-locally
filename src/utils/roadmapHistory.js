export function pushRoadmapHistory(history,nodes,connections) {
    return [...history.slice(-19),{
        nodes:nodes.map(node=>({...node})),
        connections:connections.map(connection=>({...connection}))
    }]
}
export function undoRoadmapHistory(history) {
    if(!history.length)return null
    return {snapshot:history[history.length-1],history:history.slice(0,-1)}
}
