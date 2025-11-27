// Whale Alert API Service
// Backend API üzerinden Whale Alert API'den büyük transferleri çeker
// Ücretsiz plan: 10 istek/dakika

import BaseService from '../core/BaseService'
import logger from '../utils/logger'

class WhaleService extends BaseService {
  constructor() {
    super()
    this.baseUrl = 'https://api.whale-alert.io/v1'
    this.apiKey = import.meta.env.VITE_WHALE_ALERT_API_KEY || ''
    
    // Backend API URL
    const getApiUrl = () => {
      if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
      if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
      if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
        return window.location.origin
      }
      return 'http://localhost:3000'
    }
    this.backendApiUrl = getApiUrl()
    
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000, // 1 dakika
      maxRequests: 10 // Ücretsiz plan limiti
    }
  }

  /**
   * Rate limit kontrolü
   */
  checkRateLimit() {
    const now = Date.now()
    if (now > this.rateLimit.resetTime) {
      this.rateLimit.requests = 0
      this.rateLimit.resetTime = now + 60000
    }
    
    if (this.rateLimit.requests >= this.rateLimit.maxRequests) {
      const waitTime = this.rateLimit.resetTime - now
      throw new Error(`Rate limit aşıldı. ${Math.ceil(waitTime / 1000)} saniye sonra tekrar deneyin.`)
    }
    
    this.rateLimit.requests++
  }

  /**
   * Son whale transferlerini getir
   * Önce backend cache'den çeker, yoksa backend API'yi çağırır
   * @param {Object} options - Filtreleme seçenekleri
   * @param {number} options.min_value - Minimum değer (USD)
   * @param {string} options.currency - Coin sembolü (BTC, ETH, vb.)
   * @param {number} options.start - Başlangıç zamanı (timestamp)
   * @param {number} options.limit - Sonuç sayısı (max 100)
   */
  async getTransactions(options = {}) {
    try {
      // Önce backend cache'den çek
      const cacheResponse = await fetch(`${this.backendApiUrl}/cache/whale_transactions`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 saniye timeout
      })

      if (cacheResponse.ok) {
        const cacheResult = await cacheResponse.json()
        if (cacheResult.success && cacheResult.data && cacheResult.data.data) {
          const whaleData = cacheResult.data.data
          if (whaleData.transactions && whaleData.transactions.length > 0) {
            // Cache'den gelen veriyi filtrele (options'a göre)
            let filtered = whaleData.transactions

            if (options.currency) {
              filtered = filtered.filter(tx => tx.symbol === options.currency.toUpperCase())
            }

            if (options.min_value) {
              filtered = filtered.filter(tx => tx.amount_usd >= options.min_value)
            }

            return {
              success: true,
              data: filtered,
              exchangeFlow: whaleData.exchangeFlow,
              count: filtered.length,
              fromCache: true
            }
          }
        }
      }

      // Cache yok veya eski, backend'e update isteği gönder
      // Backend Whale Alert API'yi çağıracak ve MongoDB'ye kaydedecek
      const updateParams = new URLSearchParams({
        min_value: (options.min_value || 1000000).toString(),
        limit: Math.min((options.limit || 100), 100).toString(),
        ...(options.currency && { currency: options.currency }),
        ...(options.start && { start: options.start.toString() })
      })

      const updateResponse = await fetch(`${this.backendApiUrl}/api/whale/update?${updateParams}`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000) // 20 saniye timeout (API çağrısı uzun sürebilir)
      })

      if (updateResponse.ok) {
        const updateResult = await updateResponse.json()
        if (updateResult.success && updateResult.data) {
          return {
            success: true,
            data: updateResult.data.transactions || [],
            exchangeFlow: updateResult.data.exchangeFlow,
            count: updateResult.data.count || 0,
            fromCache: false
          }
        }
      }

      // Backend API başarısız, direkt Whale Alert API'yi dene (fallback)
      return await this.getTransactionsDirect(options)
    } catch (error) {
      logger.error('Whale service hatası:', error)
      // Fallback: Direkt Whale Alert API
      return await this.getTransactionsDirect(options)
    }
  }

  /**
   * Direkt Whale Alert API'den çek (fallback)
   */
  async getTransactionsDirect(options = {}) {
    if (!this.apiKey) {
      logger.warn('Whale Alert API key bulunamadı. VITE_WHALE_ALERT_API_KEY environment variable ayarlayın.')
      return { success: false, error: 'API key not configured', data: [] }
    }

    try {
      this.checkRateLimit()

      const params = new URLSearchParams({
        api_key: this.apiKey,
        min_value: options.min_value || 1000000,
        ...(options.currency && { currency: options.currency }),
        ...(options.start && { start: options.start }),
        ...(options.limit && { limit: Math.min(options.limit, 100) })
      })

      const response = await fetch(`${this.baseUrl}/transactions?${params}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit aşıldı. Lütfen bir dakika sonra tekrar deneyin.')
        }
        throw new Error(`API hatası: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.result === 'success' && result.transactions) {
        const transactions = result.transactions.map(tx => this.formatTransaction(tx))
        const exchangeFlow = this.calculateExchangeFlow(transactions)
        
        return {
          success: true,
          data: transactions,
          exchangeFlow: exchangeFlow,
          count: result.count || transactions.length,
          cursor: result.cursor,
          fromCache: false
        }
      }

      return { success: false, error: result.message || 'Bilinmeyen hata', data: [] }
    } catch (error) {
      logger.error('Whale Alert API hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Belirli bir coin için whale transferlerini getir
   */
  async getTransactionsByCurrency(currency, minValue = 1000000) {
    return this.getTransactions({
      currency: currency.toUpperCase(),
      min_value: minValue
    })
  }

  /**
   * Son 24 saatteki whale transferlerini getir
   */
  async getRecentTransactions(minValue = 1000000, limit = 50) {
    const start = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000) // 24 saat önce
    return this.getTransactions({
      min_value: minValue,
      start,
      limit
    })
  }

  /**
   * Transaction'ı formatla
   */
  formatTransaction(tx) {
    return {
      id: tx.id || tx.hash,
      hash: tx.hash,
      blockchain: tx.blockchain,
      symbol: tx.symbol,
      amount: parseFloat(tx.amount) || 0,
      amount_usd: parseFloat(tx.amount_usd) || 0,
      from: {
        address: tx.from?.address,
        owner: tx.from?.owner,
        owner_type: tx.from?.owner_type // exchange, unknown, individual
      },
      to: {
        address: tx.to?.address,
        owner: tx.to?.owner,
        owner_type: tx.to?.owner_type
      },
      timestamp: tx.timestamp ? new Date(tx.timestamp * 1000) : new Date(),
      transaction_count: tx.transaction_count || 1,
      type: this.determineTransactionType(tx)
    }
  }

  /**
   * Transaction tipini belirle
   */
  determineTransactionType(tx) {
    const fromType = tx.from?.owner_type
    const toType = tx.to?.owner_type

    if (fromType === 'exchange' && toType === 'exchange') {
      return 'exchange_to_exchange'
    } else if (fromType === 'exchange' && toType !== 'exchange') {
      return 'exchange_outflow' // Exchange'den çıkış
    } else if (fromType !== 'exchange' && toType === 'exchange') {
      return 'exchange_inflow' // Exchange'e giriş
    } else if (fromType === 'unknown' && toType === 'unknown') {
      return 'wallet_to_wallet'
    }

    return 'unknown'
  }

  /**
   * Exchange inflow/outflow hesapla
   */
  calculateExchangeFlow(transactions) {
    const flow = {
      inflow: 0,   // Exchange'e giriş
      outflow: 0,  // Exchange'den çıkış
      net: 0,
      byExchange: {},
      byCurrency: {}
    }

    transactions.forEach(tx => {
      const amount = tx.amount_usd || 0
      
      if (tx.type === 'exchange_inflow') {
        flow.inflow += amount
        const exchange = tx.to?.owner || 'Unknown'
        flow.byExchange[exchange] = (flow.byExchange[exchange] || 0) + amount
      } else if (tx.type === 'exchange_outflow') {
        flow.outflow += amount
        const exchange = tx.from?.owner || 'Unknown'
        flow.byExchange[exchange] = (flow.byExchange[exchange] || 0) - amount
      }

      const currency = tx.symbol || 'Unknown'
      if (!flow.byCurrency[currency]) {
        flow.byCurrency[currency] = { inflow: 0, outflow: 0 }
      }
      
      if (tx.type === 'exchange_inflow') {
        flow.byCurrency[currency].inflow += amount
      } else if (tx.type === 'exchange_outflow') {
        flow.byCurrency[currency].outflow += amount
      }
    })

    flow.net = flow.inflow - flow.outflow

    return flow
  }
}

const whaleService = new WhaleService()
export default whaleService

