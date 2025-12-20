// Home sayfası için kripto veri hook'u
// GlobalDataManager'dan veri alır

import { useState, useEffect, useCallback, useRef } from 'react'
import globalDataManager from '../managers/globalDataManager'

const useCryptoData = () => {
  const [coins, setCoins] = useState([])
  const [topMovers, setTopMovers] = useState({ topGainers: [], topLosers: [] })
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  // KRİTİK: Closure sorununu önlemek için useRef kullan
  const coinsRef = useRef([])

  useEffect(() => {
    // Mevcut veriyi al - ANINDA (cache'den)
    const currentData = globalDataManager.getData()
    if (currentData.coins && currentData.coins.length > 0) {
      // Cache'den veri varsa ANINDA göster
      setCoins(currentData.coins)
      coinsRef.current = currentData.coins // Ref'i güncelle
      setTopMovers(currentData.topMovers || { topGainers: [], topLosers: [] })
      setLoading(false)
    } else {
      // Cache'de veri yoksa MongoDB'den çekilecek, loading true kalsın
      // loadMissingDataFromMongoDB() constructor'da çağrılıyor
    }

    // Abone ol - veri geldiğinde ANINDA göster (cache veya MongoDB'den)
    const unsubscribe = globalDataManager.subscribe((data) => {
      // KRİTİK BUG FIX: dataChanged kontrolü kaldırıldı!
      // Önceki kod bazen gerçek değişiklikleri algılayamıyordu
      // globalDataManager zaten timestamp kontrolü yapıyor, burada tekrar kontrol etmeye gerek yok
      if (data.coins && data.coins.length > 0) {
        // Her zaman yeni veriyi göster
        setCoins([...data.coins])
        coinsRef.current = [...data.coins]
        setTopMovers({
          topGainers: [...(data.topMovers?.topGainers || [])],
          topLosers: [...(data.topMovers?.topLosers || [])]
        })
        setLoading(false)
      }
      setIsUpdating(data.isUpdating || false)
      setLastUpdate(data.lastCryptoUpdate)
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

