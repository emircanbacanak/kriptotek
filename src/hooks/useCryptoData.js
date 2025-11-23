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
    // Mevcut veriyi al - ANINDA (cache'den)
    const currentData = globalDataManager.getData()
    if (currentData.coins && currentData.coins.length > 0) {
      setCoins(currentData.coins)
      setTopMovers(currentData.topMovers || { topGainers: [], topLosers: [] })
      setLoading(false)
      // Cache'den veri varsa direkt çık, MongoDB'den çekmeye gerek yok
      // Abone ol ama (güncellemeler için)
      const unsubscribe = globalDataManager.subscribe((data) => {
        setCoins(data.coins || [])
        setTopMovers(data.topMovers || { topGainers: [], topLosers: [] })
        setIsUpdating(data.isUpdating || false)
        setLastUpdate(data.lastCryptoUpdate)
      })
      return () => unsubscribe()
    }
    
    // Cache'de veri yoksa MongoDB'den hızlıca çek (max 3 saniye)
    // Her 50ms'de bir kontrol et (çok hızlı)
    let retryCount = 0
    const maxRetries = 60 // 60 x 50ms = 3 saniye
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
          // 3 saniye sonra bile veri yoksa loading'i kapat (sayfa açılsın)
          setLoading(false)
          clearInterval(checkDataInterval)
        }
      }
    }, 50) // Her 50ms'de bir kontrol et (çok hızlı)
    
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

