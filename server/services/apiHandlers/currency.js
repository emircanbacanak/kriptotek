/**
 * Currency Rates Handler
 * ExchangeRate API'den döviz kurlarını çeker
 */

const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest/USD'

/**
 * ExchangeRate API'den döviz kurlarını çek
 */
async function fetchCurrencyRates() {
  try {
    const { fetch } = await import('undici')
    
    const response = await fetch(EXCHANGE_RATE_API, {
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 saniye timeout
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
    throw new Error(`ExchangeRate API error: ${error.message}`)
  }
}

export { fetchCurrencyRates }

