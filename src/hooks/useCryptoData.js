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
      // KRİTİK: Yeni veri geldiğinde her zaman güncelle (eski veriye dönme)
      // React state'i her zaman güncelle, timestamp kontrolü yapma (globalDataManager zaten yapıyor)
      if (data.coins && data.coins.length > 0) {
        // KRİTİK: Veri gerçekten değişti mi kontrol et (gereksiz güncellemeleri önle)
        // İlk coin'in ID'si ve fiyatını karşılaştır - useRef kullan (closure sorununu önle)
        const newFirstCoin = data.coins[0]
        const currentFirstCoin = coinsRef.current[0] // Ref'ten al (güncel değer)
        
        // Eğer veri gerçekten değiştiyse güncelle
        const dataChanged = !currentFirstCoin || 
                           currentFirstCoin.id !== newFirstCoin.id || 
                           currentFirstCoin.current_price !== newFirstCoin.current_price ||
                           coinsRef.current.length !== data.coins.length
        
        if (dataChanged) {
          // KRİTİK: React state'i her zaman güncelle (yeni referans ile)
          // Array referansı değişmeli ki React güncellemeyi algılasın
          setCoins([...data.coins]) // Yeni array referansı oluştur
          coinsRef.current = [...data.coins] // Ref'i güncelle
          setTopMovers({
            topGainers: [...(data.topMovers?.topGainers || [])],
            topLosers: [...(data.topMovers?.topLosers || [])]
          }) // Yeni object referansı oluştur
          setLoading(false) // Veri geldiğinde ANINDA loading'i kapat
        } else {
          // Veri değişmedi, gereksiz güncelleme yapma
        }
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

