import React from 'react'
import { Sparkles } from 'lucide-react'

/**
 * PageSkeleton - Sayfa yüklenirken gösterilen skeleton loading komponenti
 * React.lazy ile lazy-loaded sayfalar için Suspense fallback olarak kullanılır
 */
const PageSkeleton = () => {
    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <div className="text-center">
                <div className="relative w-20 h-20 mx-auto mb-6">
                    <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-800 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" style={{ animationDuration: '1s' }}></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-xl">
                            <Sparkles className="w-6 h-6 text-white animate-pulse" />
                        </div>
                    </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 font-semibold text-lg">Yükleniyor...</p>
            </div>
        </div>
    )
}

export default PageSkeleton
