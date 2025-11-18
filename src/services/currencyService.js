/**
 * Currency Service
 * Döviz kurlarını yöneten servis
 * Artık backend scheduler tarafından yönetiliyor, MongoDB'den okuyoruz
 */

const CACHE_KEY = 'currency_rates_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika

const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data
      }
    }
  } catch (error) {
    // Sessiz devam et
  }
  return null
}

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
 * Döviz kurlarını MongoDB'den çek (backend scheduler tarafından yönetiliyor)
 */
const fetchCurrencyRates = async () => {
  try {
    // Önce MongoDB'den çek
    const response = await fetch(`${MONGO_API_URL}/api/cache/currency_rates`, {
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    })
    
    if (response.ok) {
      const result = await response.json()
      if (result.success && result.data) {
        // Başarılı, cache'e kaydet
        setCachedData(result.data)
        return {
          data: result.data,
          apiStatus: {
            source: 'mongodb',
            success: true,
            apiStatuses: [
              { name: 'MongoDB Currency Rates', success: true }
            ]
          }
        }
      }
    }
    
    // MongoDB'den veri yoksa, cache'den dene
    const cachedData = getCachedData()
    if (cachedData) {
      return {
        data: cachedData,
        apiStatus: {
          source: 'stale_cache',
          success: true,
          apiStatuses: [
            { name: 'MongoDB Currency Rates', success: false, error: 'Not found' },
            { name: 'Stale Cache Fallback', success: true }
          ]
        }
      }
    }
    
    // Son çare: Varsayılan kurlar (güncel olmayabilir)
    const defaultRates = {
      USD: 1.0,
      EUR: 0.92,
      TRY: 42.0,
      GBP: 0.79,
      JPY: 150.0
    }
    
    return {
      data: defaultRates,
      apiStatus: {
        source: 'default',
        success: false,
        apiStatuses: [
          { name: 'MongoDB Currency Rates', success: false, error: 'Not found' },
          { name: 'Default Rates', success: true }
        ]
      }
    }
  } catch (error) {
    // Fallback: Cache'den dene
    const cachedData = getCachedData()
    if (cachedData) {
      return {
        data: cachedData,
        apiStatus: {
          source: 'stale_cache',
          success: true,
          error: error.message,
          apiStatuses: [
            { name: 'MongoDB Currency Rates', success: false, error: error.message },
            { name: 'Stale Cache Fallback', success: true }
          ]
        }
      }
    }
    
    // Son çare: Varsayılan kurlar
    const defaultRates = {
      USD: 1.0,
      EUR: 0.92,
      TRY: 42.0,
      GBP: 0.79,
      JPY: 150.0
    }
    
    return {
      data: defaultRates,
      apiStatus: {
        source: 'default',
        success: false,
        error: error.message,
        apiStatuses: [
          { name: 'MongoDB Currency Rates', success: false, error: error.message },
          { name: 'Default Rates', success: true }
        ]
      }
    }
  }
}

const currencyService = {
  /**
   * Döviz kurlarını çek (cache kontrolü ile)
   */
  async fetchCurrencyRates(useCache = true) {
    try {
      // Önce cache'den kontrol et
      if (useCache) {
        const cachedData = getCachedData()
        if (cachedData) {
          return {
            data: cachedData,
            apiStatus: {
              source: 'cache',
              success: true,
              apiStatuses: [
                { name: 'Cache', success: true }
              ]
            }
          }
        }
      }
      
      // Cache yok veya eski - API'den çek
      const result = await fetchCurrencyRates()
      
      // Başarılı ise cache'e kaydet
      if (result.data && result.apiStatus.success) {
        setCachedData(result.data)
      }
      
      return result
    } catch (error) {
      // Cache'den dene
      const cachedData = getCachedData()
      if (cachedData) {
        return {
          data: cachedData,
          apiStatus: {
            source: 'stale_cache_fallback',
            success: true,
            error: error.message,
            apiStatuses: [
              { name: 'ExchangeRate API', success: false, error: error.message },
              { name: 'Stale Cache Fallback', success: true }
            ]
          }
        }
      }
      
      throw {
        error,
        apiStatus: {
          source: 'api',
          success: false,
          error: error.message,
          apiStatuses: [
            { name: 'ExchangeRate API', success: false, error: error.message }
          ]
        }
      }
    }
  },

  /**
   * Döviz kurlarını çek (API durumları ile)
   */
  async fetchCurrencyRatesWithStatus(useCache = true) {
    return await this.fetchCurrencyRates(useCache)
  }
}

export default currencyService

