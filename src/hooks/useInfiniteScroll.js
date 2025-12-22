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

    // Scroll container'ı bul - sentinel'in overflow scroll parent'ı
    const findScrollParent = useCallback((element) => {
        if (!element) return null

        let parent = element.parentElement
        while (parent) {
            const style = window.getComputedStyle(parent)
            const overflowY = style.overflowY
            const overflowX = style.overflowX

            // overflow-auto veya overflow-scroll olan parent'ı bul
            if (overflowY === 'auto' || overflowY === 'scroll' ||
                overflowX === 'auto' || overflowX === 'scroll') {
                // Gerçekten scroll edilebilir olup olmadığını kontrol et
                if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) {
                    return parent
                }
            }
            parent = parent.parentElement
        }
        return null // Bulunamazsa viewport kullanılacak
    }, [])

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

            // Scroll container'ı bul - tablo gibi iç container'lar için
            const scrollContainer = findScrollParent(visibleSentinel)

            // IntersectionObserver kullan - scroll container varsa onu root olarak kullan
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && hasMore && !loadingMore) {
                            loadMore()
                        }
                    })
                },
                {
                    root: scrollContainer, // Scroll container varsa onu kullan, yoksa viewport
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
    }, [hasMore, loadingMore, loadMore, threshold, sentinelIds, findScrollParent])

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
