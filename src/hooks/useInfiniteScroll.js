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

    // Scroll container'ları bul ve dinle
    useEffect(() => {
        // Biraz gecikme ile DOM'un hazır olmasını bekle
        const setupTimeout = setTimeout(() => {
            // Görünür sentinel'i bul (ID ile)
            let visibleSentinel = null
            for (const id of sentinelIds) {
                const el = document.getElementById(id)
                if (el) {
                    const rect = el.getBoundingClientRect()
                    // Element width/height > 0 ve parent görünür mü?
                    if (rect.width > 0 || el.offsetParent !== null) {
                        visibleSentinel = el
                        break
                    }
                }
            }

            // sentinelRef ile de kontrol et
            if (!visibleSentinel && sentinelRef.current) {
                visibleSentinel = sentinelRef.current
            }

            if (!visibleSentinel) {
                return
            }

            // En yakın scrollable parent'ı bul
            const findScrollParent = (element) => {
                let parent = element.parentElement
                while (parent) {
                    const style = window.getComputedStyle(parent)

                    if (style.display === 'none') {
                        parent = parent.parentElement
                        continue
                    }

                    const overflowY = style.overflowY
                    const maxHeight = style.maxHeight

                    const isScrollable = overflowY === 'auto' || overflowY === 'scroll'
                    const hasMaxHeight = maxHeight && maxHeight !== 'none' && !maxHeight.includes('100')
                    const hasContent = parent.scrollHeight > parent.clientHeight

                    if (isScrollable && hasMaxHeight && hasContent) {
                        return parent
                    }
                    parent = parent.parentElement
                }
                return null
            }

            const scrollContainer = findScrollParent(visibleSentinel)

            if (!scrollContainer) {
                return
            }

            const handleScroll = () => {
                if (!hasMore || loadingMore) return

                const scrollBottom = scrollContainer.scrollTop + scrollContainer.clientHeight
                const scrollHeight = scrollContainer.scrollHeight
                const isNearBottom = scrollBottom >= scrollHeight - threshold

                if (isNearBottom) {
                    loadMore()
                }
            }

            scrollContainer.addEventListener('scroll', handleScroll, { passive: true })

            return () => {
                scrollContainer.removeEventListener('scroll', handleScroll)
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
