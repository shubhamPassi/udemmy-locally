import { useState, useCallback, useMemo, useEffect } from 'react';
import NotificationToast from '../components/common/NotificationToast'
import {currentStorageError} from '../utils/progressStorage.js'

import {NotificationContext} from './contextTypes.js'

let nextId = 0

export function NotificationProvider({ children }) {
    const [notifications, setNotifications] = useState([])

    const showNotification = useCallback((message, type = 'info', duration = 5000) => {
        const id = nextId++
        setNotifications(prev => [...prev, { id, message, type, duration }])
    }, [])

    const removeNotification = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id))
    }, [])
    const value = useMemo(() => ({ showNotification }), [showNotification])
    useEffect(() => {
        if(currentStorageError())showNotification(currentStorageError(),'error',15000)
        const report = event => showNotification(event.detail, 'error', 15000)
        window.addEventListener('tutin-storage-error', report)
        return () => window.removeEventListener('tutin-storage-error', report)
    }, [showNotification])

    return (
        <NotificationContext.Provider value={value}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
                {notifications.map((n, i) => (
                    <div key={n.id} style={{ transform: `translateY(-${i * 4}px)` }}>
                        <NotificationToast
                            message={n.message}
                            type={n.type}
                            duration={n.duration}
                            onClose={() => removeNotification(n.id)}
                        />
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    )
}
