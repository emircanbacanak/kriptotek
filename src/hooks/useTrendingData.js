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
        setTrendingCoins(data.trendingCoins || [])
        setLastUpdate(data.lastTrendingUpdate)
        setIsUpdating(data.isUpdating || false)
        if (data.trendingCoins && data.trendingCoins.length > 0) {
          setLoading(false)
        }
      })
      return () => unsubscribe()
    }
    
    // Cache'de veri yoksa MongoDB'den hızlıca çek (max 3 saniye)
    setTrendingCoins([])
    setLoading(true)
    let retryCount = 0
    const maxRetries = 60 // 60 x 50ms = 3 saniye
    const checkDataInterval = setInterval(() => {
      const data = globalDataManager.getData()
      if (data.trendingCoins && data.trendingCoins.length > 0) {
        setTrendingCoins(data.trendingCoins)
        setLastUpdate(data.lastTrendingUpdate)
        setLoading(false)
        clearInterval(checkDataInterval)
      } else {
        retryCount++
        if (retryCount >= maxRetries) {
          setLoading(false)
          clearInterval(checkDataInterval)
        }
      }
    }, 50) // Her 50ms'de bir kontrol et

    // Abone ol ve güncellemeleri dinle
    const unsubscribe = globalDataManager.subscribe((data) => {
      setTrendingCoins(data.trendingCoins || [])
      setLastUpdate(data.lastTrendingUpdate)
      setIsUpdating(data.isUpdating || false)
      if (data.trendingCoins && data.trendingCoins.length > 0) {
        setLoading(false)
      }
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

