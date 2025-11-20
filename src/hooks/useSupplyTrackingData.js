import { useState, useEffect } from 'react'
import globalDataManager from '../managers/globalDataManager'

/**
 * Supply Tracking verilerini globalDataManager'dan alan hook
 */
const useSupplyTrackingData = () => {
  const [supplyTrackingData, setSupplyTrackingData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  useEffect(() => {
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    if (currentData.supplyTrackingData) {
      setSupplyTrackingData(currentData.supplyTrackingData)
      setLastUpdate(currentData.lastSupplyTrackingUpdate)
      setLoading(false)
    }
    setIsUpdating(currentData.isUpdating || false)

    // Abone ol ve güncellemeleri dinle
    const unsubscribe = globalDataManager.subscribe((data) => {
      setSupplyTrackingData(data.supplyTrackingData)
      setLastUpdate(data.lastSupplyTrackingUpdate)
      setIsUpdating(data.isUpdating || false)
      if (data.supplyTrackingData) {
        setLoading(false)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return {
    supplyTrackingData,
    loading,
    isUpdating,
    lastUpdate
  }
}

export default useSupplyTrackingData

