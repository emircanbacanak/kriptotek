/**
 * Currency Service
 * Döviz kurlarını yöneten servis
 */

const CACHE_KEY = 'currency_rates_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika

// ExchangeRate API (ücretsiz)
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD'

// Fallback: Fixer.io veya başka bir API kullanılabilir
// Şimdilik ExchangeRate API kullanıyoruz (ücretsiz, rate limit var ama yeterli)

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
 * Döviz kurlarını API'den çek
 */
const fetchCurrencyRates = async () => {
  try {
    const response = await fetch(EXCHANGE_RATE_API, {
      headers: {
        'Accept': 'application/json'
      },
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    // API'den gelen format: { base: 'USD', rates: { EUR: 0.92, TRY: 42.0, ... } }
    // Bizim format: { EUR: 0.92, TRY: 42.0, ... }
    const rates = data.rates || {}
    
    // USD'yi de ekle (1.0)
    rates.USD = 1.0
    
    return {
      data: rates,
      apiStatus: {
        source: 'api',
        success: true,
        apiStatuses: [
          { name: 'ExchangeRate API', success: true }
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
            { name: 'ExchangeRate API', success: false, error: error.message },
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
        error: error.message,
        apiStatuses: [
          { name: 'ExchangeRate API', success: false, error: error.message },
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

