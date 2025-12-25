import React, { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

// Toast Context
const ToastContext = createContext(null)

// Toast types
const TOAST_TYPES = {
    success: {
        icon: CheckCircle,
        bgClass: 'bg-green-500',
        borderClass: 'border-green-600',
        textClass: 'text-white'
    },
    error: {
        icon: XCircle,
        bgClass: 'bg-red-500',
        borderClass: 'border-red-600',
        textClass: 'text-white'
    },
    warning: {
        icon: AlertTriangle,
        bgClass: 'bg-yellow-500',
        borderClass: 'border-yellow-600',
        textClass: 'text-white'
    },
    info: {
        icon: Info,
        bgClass: 'bg-blue-500',
        borderClass: 'border-blue-600',
        textClass: 'text-white'
    }
}

// Single Toast Component
const Toast = ({ id, type, title, message, onClose, duration = 5000 }) => {
    const config = TOAST_TYPES[type] || TOAST_TYPES.info
    const IconComponent = config.icon

    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => {
                onClose(id)
            }, duration)
            return () => clearTimeout(timer)
        }
    }, [id, duration, onClose])

    return (
        <div
            className={`flex items-start gap-3 p-4 rounded-xl shadow-2xl border ${config.bgClass} ${config.borderClass} ${config.textClass} min-w-[320px] max-w-[420px] animate-slide-in-right backdrop-blur-sm`}
            role="alert"
        >
            <IconComponent className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
                {title && (
                    <h4 className="font-semibold text-sm mb-1">{title}</h4>
                )}
                <p className="text-sm opacity-95 break-words">{message}</p>
            </div>
            <button
                onClick={() => onClose(id)}
                className="flex-shrink-0 p-1 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Kapat"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}

// Toast Container Component
const ToastContainer = ({ toasts, removeToast }) => {
    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3">
            {toasts.map((toast) => (
                <Toast
                    key={toast.id}
                    {...toast}
                    onClose={removeToast}
                />
            ))}
        </div>
    )
}

// Toast Provider Component
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([])

    const addToast = useCallback((type, message, title = null, duration = 5000) => {
        const id = Date.now() + Math.random()
        setToasts((prev) => [...prev, { id, type, message, title, duration }])
        return id
    }, [])

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, [])

    const success = useCallback((message, title = null) => {
        return addToast('success', message, title)
    }, [addToast])

    const error = useCallback((message, title = null) => {
        return addToast('error', message, title)
    }, [addToast])

    const warning = useCallback((message, title = null) => {
        return addToast('warning', message, title)
    }, [addToast])

    const info = useCallback((message, title = null) => {
        return addToast('info', message, title)
    }, [addToast])

    const value = {
        success,
        error,
        warning,
        info,
        addToast,
        removeToast
    }

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    )
}

// Hook to use toast
export const useToast = () => {
    const context = useContext(ToastContext)
    if (!context) {
        // Fallback - eğer provider yoksa konsola yaz
        return {
            success: (msg) => console.log('✅ Toast success:', msg),
            error: (msg) => console.error('❌ Toast error:', msg),
            warning: (msg) => console.warn('⚠️ Toast warning:', msg),
            info: (msg) => console.info('ℹ️ Toast info:', msg)
        }
    }
    return context
}

export default ToastProvider
