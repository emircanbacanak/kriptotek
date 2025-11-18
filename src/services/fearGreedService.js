/**
 * Fear & Greed Index Service
 * Crypto Fear & Greed Index verilerini yönetir
 */
import BaseService from '../core/BaseService.js'

class FearGreedService extends BaseService {
  constructor() {
    super('Fear & Greed Index')
    this.CACHE_KEY = 'fear_greed_cache'
    this.CACHE_TIME_KEY = 'fear_greed_cache_time'
    this.CACHE_DURATION = 5 * 60 * 1000 // 5 dakika
  }

  /**
   * MongoDB'den Fear & Greed verisi çek
   */
  async loadFromMongoDB() {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const response = await fetch(`${MONGO_API_URL}/api/cache/fear_greed`)
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          return { data: result.data, apiStatus: { name: 'MongoDB Fear & Greed', success: true } }
        }
      } else if (response.status === 404) {
        // Veri yok, bu normal
        return { data: null, apiStatus: { name: 'MongoDB Fear & Greed', success: false, error: 'Not found (404)' } }
      }
    } catch (error) {
      return { data: null, apiStatus: { name: 'MongoDB Fear & Greed', success: false, error: error.message } }
    }
    return { data: null, apiStatus: { name: 'MongoDB Fear & Greed', success: false, error: 'Unknown error' } }
  }

  /**
   * MongoDB'ye Fear & Greed verisi kaydet
   */
  async saveToMongoDB(data) {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const response = await fetch(`${MONGO_API_URL}/api/cache/fear_greed`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        return true
      }
    } catch (error) {
      // Sessiz devam et
    }
    return false
  }

  /**
   * API'den Fear & Greed Index verilerini çek
   */
  async fetchFromAPI() {
    try {
      // Alternative.me API'den çek
      const response = await fetch('https://api.alternative.me/fng/', {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-cache'
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result && result.data && result.data.length > 0) {
          const latest = result.data[0]
          return {
            data: {
              value: parseInt(latest.value) || null,
              classification: latest.value_classification || null,
              timestamp: parseInt(latest.timestamp) * 1000 || Date.now(),
              timeUntilUpdate: parseInt(latest.time_until_update) || null
            },
            apiStatus: { name: 'Alternative.me Fear & Greed', success: true }
          }
        }
      }
      return {
        data: null,
        apiStatus: { name: 'Alternative.me Fear & Greed', success: false, error: `HTTP ${response.status}` }
      }
    } catch (error) {
      return {
        data: null,
        apiStatus: { name: 'Alternative.me Fear & Greed', success: false, error: error.message }
      }
    }
  }

  /**
   * Fear & Greed Index verilerini çek
   */
  async fetchFearGreedData() {
    const apiStatuses = []
    try {
      // Önce MongoDB'den çek
      const mongoResult = await this.loadFromMongoDB()
      let fearGreedData = mongoResult.data
      if (mongoResult.apiStatus) {
        apiStatuses.push(mongoResult.apiStatus)
      }
      
      // Eğer MongoDB'de veri yoksa veya eski ise, API'den çek
      if (!fearGreedData || !fearGreedData.value || !fearGreedData.timestamp) {
        const apiResult = await this.fetchFromAPI()
        if (apiResult.apiStatus) {
          apiStatuses.push(apiResult.apiStatus)
        }
        fearGreedData = apiResult.data
        
        // API'den veri çekildiyse MongoDB'ye kaydet
        if (fearGreedData && fearGreedData.value !== null && fearGreedData.value !== undefined) {
          await this.saveToMongoDB(fearGreedData)
        }
      }
      
      if (fearGreedData && fearGreedData.value !== undefined && fearGreedData.value !== null) {
        this.setCachedData(fearGreedData)
        window.dispatchEvent(new CustomEvent('fearGreedUpdated', { detail: fearGreedData }))
        return { data: fearGreedData, apiStatuses }
      }
      
      // Fallback: Cache'den dene (sadece gerçek veri varsa)
      const cached = this.getCachedData()
      if (cached && cached.value !== undefined && cached.value !== null) {
        return { data: cached, apiStatuses: [{ name: 'Cache Fallback', success: true }] }
      }
      
      // Varsayılan değer döndürme - null döndür
      return { data: null, apiStatuses }
    } catch (error) {
      // Cache'den dene (sadece gerçek veri varsa)
      const cached = this.getCachedData()
      if (cached && cached.value !== undefined && cached.value !== null) {
        return { data: cached, apiStatuses: [{ name: 'Cache Fallback', success: true }] }
      }
      
      // Varsayılan değer döndürme - null döndür
      return { data: null, apiStatuses: [{ name: 'Error', success: false, error: error.message }] }
    }
  }

  /**
   * Cache'den veri al
   */
  getCachedData() {
    try {
      const cachedData = localStorage.getItem(this.CACHE_KEY)
      const cacheTime = localStorage.getItem(this.CACHE_TIME_KEY)
      
      if (cachedData && cacheTime) {
        const age = Date.now() - parseInt(cacheTime)
        if (age < this.CACHE_DURATION) {
          return JSON.parse(cachedData)
        }
      }
      
      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Cache'e veri kaydet
   */
  setCachedData(data) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data))
      localStorage.setItem(this.CACHE_TIME_KEY, Date.now().toString())
      super.setCache(this.CACHE_KEY, data, this.CACHE_DURATION)
    } catch (error) {
      // Cache yazma hatası - sessiz devam et
    }
  }
}

const fearGreedService = new FearGreedService()
export default fearGreedService

