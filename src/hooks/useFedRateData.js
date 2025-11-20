import { useState, useEffect } from 'react'
import globalDataManager from '../managers/globalDataManager'

/**
 * Fed Rate verilerini globalDataManager'dan alan hook
 */
const useFedRateData = () => {
  const [fedRateData, setFedRateData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    if (currentData.fedRateData) {
      setFedRateData(currentData.fedRateData)
      setLastUpdate(currentData.lastFedRateUpdate)
      setLoading(false)
    } else {
      // Veri yoksa, loading state'ini kontrol et
      // Eğer globalDataManager güncelleme yapıyorsa bekle, yoksa loading false yap
      if (!currentData.isUpdating) {
        // Veri yok ve güncelleme yapılmıyor, backend'den çekmeyi dene
        setLoading(false)
      }
    }
    setIsUpdating(currentData.isUpdating || false)

    // Abone ol ve güncellemeleri dinle
    const unsubscribe = globalDataManager.subscribe((data) => {
      setFedRateData(data.fedRateData)
      setLastUpdate(data.lastFedRateUpdate)
      setIsUpdating(data.isUpdating || false)
      if (data.fedRateData) {
        setLoading(false)
      } else if (!data.isUpdating) {
        // Veri yok ve güncelleme yapılmıyor, loading false yap
        setLoading(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return {
    fedRateData,
    loading,
    isUpdating,
    lastUpdate
  }
}

export default useFedRateData

