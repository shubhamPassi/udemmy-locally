// Share only requests currently running; completed results are never reused.
export function sharedRequest(load) {
    let pending
    return () => {
        if (!pending) pending = Promise.resolve().then(load).finally(() => { pending = null })
        return pending
    }
}
