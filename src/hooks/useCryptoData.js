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
    // Mevcut veriyi al - ANINDA
    const currentData = globalDataManager.getData()
    if (currentData.coins && currentData.coins.length > 0) {
      setCoins(currentData.coins)
      setTopMovers(currentData.topMovers || { topGainers: [], topLosers: [] })
      setLoading(false)
      return // Veri varsa direkt çık
    }
    
    // Veri yoksa backend'den veri yüklenene kadar bekle (max 5 saniye, hızlı kontrol)
    let retryCount = 0
    const maxRetries = 50 // 50 x 100ms = 5 saniye
    const checkDataInterval = setInterval(() => {
      const data = globalDataManager.getData()
      if (data.coins && data.coins.length > 0) {
        setCoins(data.coins)
        setTopMovers(data.topMovers || { topGainers: [], topLosers: [] })
        setLoading(false)
        clearInterval(checkDataInterval)
      } else {
        retryCount++
        if (retryCount >= maxRetries) {
          // 5 saniye sonra bile veri yoksa loading'i kapat (sayfa açılsın)
          setLoading(false)
          clearInterval(checkDataInterval)
        }
      }
    }, 100) // Her 100ms'de bir kontrol et (çok hızlı)
    
    // Abone ol - ANINDA GÜNCELLEME
    const unsubscribe = globalDataManager.subscribe((data) => {
      setCoins(data.coins || [])
      setTopMovers(data.topMovers || { topGainers: [], topLosers: [] })
      setIsUpdating(data.isUpdating || false)
      setLastUpdate(data.lastCryptoUpdate)
      
      // Veri geldiğinde loading'i kapat ve interval'i temizle
      if (data.coins && data.coins.length > 0) {
        setLoading(false)
        clearInterval(checkDataInterval)
      }
    })

    // Cleanup
    return () => {
      clearInterval(checkDataInterval)
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

