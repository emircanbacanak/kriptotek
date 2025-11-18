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
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    setTrendingCoins(currentData.trendingCoins || [])
    setLastUpdate(currentData.lastTrendingUpdate)
    setLoading(false)
    setIsUpdating(currentData.isUpdating || false)

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

