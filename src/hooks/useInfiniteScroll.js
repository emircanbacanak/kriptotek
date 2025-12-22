import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * Infinite scroll hook - SADECE iç container scroll'u ile çalışır
 * Görünür olan scroll container'ı ID ile bulur
 */
export function useInfiniteScroll(items, options = {}) {
    const {
        initialCount = 20,
        incrementCount = 20,
        threshold = 100,
        sentinelIds = [
            'desktop-scroll-sentinel',
            'mobile-scroll-sentinel',
            'supply-scroll-sentinel',
            'news-scroll-sentinel',
            'trending-scroll-sentinel'
        ]
    } = options

    const [visibleCount, setVisibleCount] = useState(initialCount)
    const [loadingMore, setLoadingMore] = useState(false)
    const sentinelRef = useRef(null)
    const prevItemsLengthRef = useRef(0)

    // Items değiştiğinde visible count'u koru
    useEffect(() => {
        if (items.length === 0) {
            setVisibleCount(initialCount)
        } else if (prevItemsLengthRef.current === 0 && items.length > 0) {
            setVisibleCount(initialCount)
        }
        prevItemsLengthRef.current = items.length
    }, [items.length, initialCount])

    // Görünen öğeler
    const visibleItems = items.slice(0, visibleCount)
    const hasMore = visibleCount < items.length

    // Daha fazla yükle
    const loadMore = useCallback(() => {
        if (loadingMore || !hasMore) return

        setLoadingMore(true)
        setTimeout(() => {
            setVisibleCount(prev => Math.min(prev + incrementCount, items.length))
            setLoadingMore(false)
        }, 50)
    }, [loadingMore, hasMore, incrementCount, items.length])

    // Reset fonksiyonu
    const reset = useCallback(() => {
        setVisibleCount(initialCount)
    }, [initialCount])

    // Scroll container'ları bul ve dinle - IntersectionObserver kullan
    useEffect(() => {
        // Biraz gecikme ile DOM'un hazır olmasını bekle
        const setupTimeout = setTimeout(() => {
            // Görünür sentinel'i bul (ID ile veya ref ile)
            let visibleSentinel = null

            // sentinelRef ile kontrol et (öncelikli)
            if (sentinelRef.current) {
                visibleSentinel = sentinelRef.current
            } else {
                // ID ile bul
                for (const id of sentinelIds) {
                    const el = document.getElementById(id)
                    if (el) {
                        const rect = el.getBoundingClientRect()
                        if (rect.width > 0 || el.offsetParent !== null) {
                            visibleSentinel = el
                            break
                        }
                    }
                }
            }

            if (!visibleSentinel) {
                return
            }

            // IntersectionObserver kullan - daha güvenilir
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && hasMore && !loadingMore) {
                            loadMore()
                        }
                    })
                },
                {
                    root: null, // viewport'u kullan
                    rootMargin: `${threshold}px`, // threshold kadar önce tetikle
                    threshold: 0.1
                }
            )

            observer.observe(visibleSentinel)

            return () => {
                observer.disconnect()
            }
        }, 100) // 100ms gecikme ile DOM hazır olmasını bekle

        return () => {
            clearTimeout(setupTimeout)
        }
    }, [hasMore, loadingMore, loadMore, threshold, sentinelIds])

    return {
        visibleItems,
        hasMore,
        loadMore,
        reset,
        loadingMore,
        sentinelRef,
        visibleCount,
        totalCount: items.length
    }
}

export default useInfiniteScroll
