import { useState, useEffect } from 'react'
import globalDataManager from '../managers/globalDataManager'

/**
 * Trending verilerini globalDataManager'dan alan hook
 */
const useTrendingData = () => {
  const [trendingCoins, setTrendingCoins] = useState([])
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    // Mevcut veriyi al - ANINDA (cache'den)
    const currentData = globalDataManager.getData()
    if (currentData.trendingCoins && currentData.trendingCoins.length > 0) {
      setTrendingCoins(currentData.trendingCoins)
      setLastUpdate(currentData.lastTrendingUpdate)
      setLoading(false)
      setIsUpdating(currentData.isUpdating || false)
      // Cache'den veri varsa direkt çık, MongoDB'den çekmeye gerek yok
      // Abone ol ama (güncellemeler için)
      const unsubscribe = globalDataManager.subscribe((data) => {
        // KRİTİK: Sadece geçerli veri varsa güncelle, yoksa mevcut veriyi koru
        if (data.trendingCoins && data.trendingCoins.length > 0) {
          setTrendingCoins(data.trendingCoins)
          setLastUpdate(data.lastTrendingUpdate)
          setLoading(false)
        }
        setIsUpdating(data.isUpdating || false)
      })
      return () => unsubscribe()
    }

    // Cache'de veri yoksa MongoDB'den ANINDA çek (interval yok, direkt subscribe)
    // Abone ol - veri geldiğinde ANINDA göster
    const unsubscribe = globalDataManager.subscribe((data) => {
      // KRİTİK: Sadece geçerli veri varsa güncelle, yoksa mevcut veriyi koru
      if (data.trendingCoins && data.trendingCoins.length > 0) {
        setTrendingCoins(data.trendingCoins)
        setLastUpdate(data.lastTrendingUpdate)
        setLoading(false)
      }
      setIsUpdating(data.isUpdating || false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return {
    trendingCoins,
    loading,
    isUpdating,
    lastUpdate
  }
}

export default useTrendingData

