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
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    if (currentData.dominanceData && currentData.dominanceData.global && currentData.dominanceData.dominanceData) {
      setDominanceData(currentData.dominanceData)
      setFearGreedIndex(currentData.fearGreedIndex)
      setLoading(false)
    }
    
    // Abone ol
    const unsubscribe = globalDataManager.subscribe((data) => {
      setDominanceData(data.dominanceData)
      setFearGreedIndex(data.fearGreedIndex)
      setIsUpdating(data.isUpdating || false)
      setLastUpdate(data.lastDominanceUpdate)
      
      // İlk veri geldiğinde loading'i kapat
      if (data.dominanceData && data.dominanceData.global && data.dominanceData.dominanceData) {
        setLoading(false)
        setError(null)
      }
      
      // Eğer veri yoksa ve güncelleme yapılmıyorsa, hata göster
      if (!data.dominanceData && !data.isUpdating && data.lastDominanceUpdate === null) {
        setError('Veri yüklenemedi. Lütfen sayfayı yenileyin.')
      }
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

