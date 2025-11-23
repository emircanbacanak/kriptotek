/**
 * Currency conversion utilities
 */

export const formatCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/A'
  
  // Fiyata göre ondalık basamak sayısını belirle
  let minFractionDigits = 2
  let maxFractionDigits = 2
  
  if (amount >= 1000) {
    // 1000'den büyük fiyatlar için 2 ondalık basamak
    minFractionDigits = 2
    maxFractionDigits = 2
  } else if (amount >= 1) {
    // 1-1000 arası için 2-4 ondalık basamak
    minFractionDigits = 2
    maxFractionDigits = 4
  } else if (amount >= 0.01) {
    // 0.01-1 arası için 4-6 ondalık basamak
    minFractionDigits = 4
    maxFractionDigits = 6
  } else {
    // 0.01'den küçük için 6-8 ondalık basamak
    minFractionDigits = 6
    maxFractionDigits = 8
  }
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits
  })
  
  return formatter.format(amount)
}

export const formatLargeNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return 'N/A'
  
  if (num >= 1e12) {
    return (num / 1e12).toFixed(2) + 'T'
  } else if (num >= 1e9) {
    return (num / 1e9).toFixed(2) + 'B'
  } else if (num >= 1e6) {
    return (num / 1e6).toFixed(2) + 'M'
  } else if (num >= 1e3) {
    return (num / 1e3).toFixed(2) + 'K'
  }
  
  return num.toFixed(2)
}

/**
 * Format large number with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (USD, EUR, TRY, etc.)
 * @returns {string} Formatted string with currency symbol
 */
export const formatLargeCurrency = (amount, currency = 'USD') => {
  if (amount === null || amount === undefined || isNaN(amount)) return 'N/A'
  
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'TRY' ? '₺' : currency
  
  // 999.999'a kadar kısaltma yapma
  if (amount < 1000000) {
    return formatCurrency(amount, currency)
  }
  
  if (amount >= 1e12) {
    return `${symbol}${(amount / 1e12).toFixed(2)}T`
  } else if (amount >= 1e9) {
    return `${symbol}${(amount / 1e9).toFixed(2)}B`
  } else if (amount >= 1e6) {
    return `${symbol}${(amount / 1e6).toFixed(2)}M`
  }
  
  return formatCurrency(amount, currency)
}

export const convertCurrency = (amount, fromCurrency, toCurrency) => {
  // For now, just return the amount as-is
  // In a real app, you'd fetch exchange rates
  return amount
}

/**
 * Get current exchange rates from window.__exchangeRates
 * @returns {Object} Exchange rates object { USD: 1.0, EUR: 0.92, TRY: 42.0, ... }
 */
export const getCurrentRates = () => {
  // window.__exchangeRates'den al (globalDataManager tarafından güncellenir)
  if (typeof window !== 'undefined' && window.__exchangeRates) {
    return window.__exchangeRates
  }
  
  // Son çare: Varsayılan kurlar (globalDataManager henüz yüklenmediyse)
  return {
    USD: 1.0,
    EUR: 0.92,
    TRY: 42.0,
    GBP: 0.79,
    JPY: 150.0
  }
}

/**
 * Set exchange rates (globalDataManager tarafından kullanılır)
 * @param {Object} rates - Exchange rates object
 */
export const setExchangeRates = (rates) => {
  if (typeof window !== 'undefined') {
    window.__exchangeRates = rates
    window.dispatchEvent(new CustomEvent('exchangeRatesUpdated', { detail: rates }))
  }
}

/**
 * Update exchange rates (globalDataManager tarafından kullanılır)
 * @param {Object} rates - Exchange rates object
 */
export const updateExchangeRates = (rates) => {
  setExchangeRates(rates)
}

/**
 * Refresh exchange rates (globalDataManager tarafından kullanılır)
 */
export const refreshExchangeRates = async () => {
  try {
    const currencyService = (await import('../services/currencyService')).default
    const result = await currencyService.fetchCurrencyRatesWithStatus(false)
    if (result && result.data) {
      setExchangeRates(result.data)
    }
  } catch (error) {
    console.error('Error refreshing exchange rates:', error)
  }
}

