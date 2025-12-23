import { useState, useEffect, useCallback } from 'react'
import globalDataManager from '../managers/globalDataManager'

const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
const CACHE_KEY = 'fed_rate_data'
const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika

/**
 * localStorage'dan Fed Rate verilerini al
 */
const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      // Cache süresi dolmuş mu kontrol et
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data
      }
    }
  } catch (error) {
    // Sessiz devam et
  }
  return null
}

/**
 * Fed Rate verilerini localStorage'a kaydet
 */
const setCachedData = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (error) {
    // Sessiz devam et
  }
}

/**
 * MongoDB'den Fed Rate verilerini çek
 */
const fetchFromMongoDB = async () => {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/fed-rate`, {
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success && result.data) {
        // localStorage'a kaydet
        setCachedData(result.data)
        return result.data
      }
    }
  } catch (error) {
    console.warn('⚠️ MongoDB\'den Fed Rate verisi alınamadı:', error.message)
  }
  return null
}

/**
 * Fed Rate verilerini globalDataManager'dan alan hook
 * Önce localStorage'dan, yoksa MongoDB'den çeker
 */
const useFedRateData = () => {
  const [fedRateData, setFedRateData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)

  // MongoDB'den veri çek
  const fetchData = useCallback(async () => {
    // Önce localStorage'dan kontrol et
    const cached = getCachedData()
    if (cached) {
      setFedRateData(cached)
      setLoading(false)
      // globalDataManager'a da set et
      globalDataManager.setFedRateData(cached, Date.now())
      return
    }

    // localStorage'da yoksa MongoDB'den çek
    setLoading(true)
    const data = await fetchFromMongoDB()
    if (data) {
      setFedRateData(data)
      // globalDataManager'a da set et
      globalDataManager.setFedRateData(data, Date.now())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // İlk yükleme: localStorage'dan veya MongoDB'den
    fetchData()

    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    if (currentData.fedRateData) {
      setFedRateData(currentData.fedRateData)
      setLastUpdate(currentData.lastFedRateUpdate)
      setLoading(false)
    } else {
      // Veri yoksa, MongoDB'den çek
      fetchData()
    }
    setIsUpdating(currentData.isUpdating || false)

    // Abone ol ve güncellemeleri dinle
    const unsubscribe = globalDataManager.subscribe((data) => {
      // KRİTİK: Sadece geçerli veri varsa güncelle, yoksa mevcut veriyi koru
      // Bu sayede notifySubscribers() null veri gönderirse sayfa içeriği kaybolmaz
      if (data.fedRateData) {
        setFedRateData(data.fedRateData)
        setLastUpdate(data.lastFedRateUpdate)
        setLoading(false)
        // localStorage'a kaydet
        setCachedData(data.fedRateData)
      }
      setIsUpdating(data.isUpdating || false)
    })

    return () => {
      unsubscribe()
    }
  }, [fetchData])

  return {
    fedRateData,
    loading,
    isUpdating,
    lastUpdate
  }
}

export default useFedRateData

