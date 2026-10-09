export async function batchWork(items, work, limit = 8) {
    const results = []
    for (let start = 0; start < items.length; start += limit) {
        const batch = items.slice(start, start + limit)
        const settled = await Promise.allSettled(batch.map((item, index) => work(item, start + index)))
        const failure = settled.find(result => result.status === 'rejected')
        if (failure) throw failure.reason
        results.push(...settled.map(result => result.value))
    }
    return results
}
