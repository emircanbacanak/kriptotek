// Home sayfası için kripto veri hook'u
// GlobalDataManager'dan veri alır

import { useState, useEffect, useCallback } from 'react'
import globalDataManager from '../managers/globalDataManager'

const useCryptoData = () => {
  const [coins, setCoins] = useState([])
  const [topMovers, setTopMovers] = useState({ topGainers: [], topLosers: [] })
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    if (currentData.coins && currentData.coins.length > 0) {
      setCoins(currentData.coins)
      setTopMovers(currentData.topMovers || { topGainers: [], topLosers: [] })
      setLoading(false)
    }
    
    // Abone ol
    const unsubscribe = globalDataManager.subscribe((data) => {
      setCoins(data.coins || [])
      setTopMovers(data.topMovers || { topGainers: [], topLosers: [] })
      setIsUpdating(data.isUpdating || false)
      setLastUpdate(data.lastCryptoUpdate)
      
      // İlk veri geldiğinde loading'i kapat
      if (data.coins && data.coins.length > 0) {
        setLoading(false)
      }
    })

    // Cleanup
    return () => {
      unsubscribe()
    }
  }, [])

  // Manuel yenileme
  const refresh = useCallback(async () => {
    await globalDataManager.refresh()
  }, [])

  return {
    coins,
    topMovers,
    loading,
    isUpdating,
    lastUpdate,
    refresh
  }
}

export default useCryptoData

