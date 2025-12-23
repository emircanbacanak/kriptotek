// Dominance sayfası için veri hook'u
// GlobalDataManager'dan veri alır

import { useState, useEffect, useCallback } from 'react'
import globalDataManager from '../managers/globalDataManager'

const useDominanceData = () => {
  const [dominanceData, setDominanceData] = useState(null)
  const [fearGreedIndex, setFearGreedIndex] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Mevcut veriyi al - ANINDA (cache'den)
    const currentData = globalDataManager.getData()
    if (currentData.dominanceData && currentData.dominanceData.global && currentData.dominanceData.dominanceData) {
      // Cache'den veri varsa ANINDA göster
      setDominanceData(currentData.dominanceData)
      setFearGreedIndex(currentData.fearGreedIndex)
      setLoading(false)
      setError(null)
    } else {
      // Cache'de veri yoksa MongoDB'den çekilecek, loading true kalsın
      // loadMissingDataFromMongoDB() constructor'da çağrılıyor
    }

    // Abone ol - veri geldiğinde ANINDA göster (cache veya MongoDB'den)
    const unsubscribe = globalDataManager.subscribe((data) => {
      // KRİTİK: Sadece geçerli veri varsa güncelle, yoksa mevcut veriyi koru
      // Bu sayede notifySubscribers() null veri gönderirse sayfa içeriği kaybolmaz
      if (data.dominanceData && data.dominanceData.global && data.dominanceData.dominanceData) {
        setDominanceData(data.dominanceData)
        setLastUpdate(data.lastDominanceUpdate)
        setLoading(false)
        setError(null)
      }

      // Fear & Greed index için ayrı kontrol
      if (data.fearGreedIndex && data.fearGreedIndex.value !== undefined) {
        setFearGreedIndex(data.fearGreedIndex)
      }

      setIsUpdating(data.isUpdating || false)
    })

    // Cleanup
    return () => {
      unsubscribe()
    }
  }, [])

  // Manuel yenileme
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await globalDataManager.refresh()
    } catch (err) {
      setError(err.message || 'Veri yenilenirken bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    dominanceData,
    fearGreedIndex,
    loading,
    isUpdating,
    lastUpdate,
    error,
    refresh
  }
}

export default useDominanceData

