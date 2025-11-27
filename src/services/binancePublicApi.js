// Binance Public REST API Service
// Binance'in ücretsiz public API'sini kullanarak büyük işlemleri tespit eder
// API key gerektirmez, tamamen ücretsiz

import logger from '../utils/logger'

class BinancePublicApi {
  constructor() {
    this.baseUrl = 'https://api.binance.com/api/v3'
    this.rateLimit = {
      requests: 0,
      resetTime: Date.now() + 60000, // 1 dakika
      maxRequests: 1200 // Binance public API limiti: 1200 requests/minute
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
   * 24 saatlik ticker verilerini getir (tüm coinler için)
   * Bu veriler büyük işlem hacimlerini gösterir
   */
  async get24hTickerStats() {
    try {
      this.checkRateLimit()

      const response = await fetch(`${this.baseUrl}/ticker/24hr`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`Binance API hatası: ${response.status}`)
      }

      const data = await response.json()
      
      // Tüm coinlerin 24 saatlik istatistiklerini döndür
      return {
        success: true,
        data: data.map(ticker => ({
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          priceChange: parseFloat(ticker.priceChangePercent),
          volume: parseFloat(ticker.volume),
          quoteVolume: parseFloat(ticker.quoteVolume), // USDT cinsinden toplam işlem hacmi
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
          count: parseInt(ticker.count) // 24 saatteki işlem sayısı
        })),
        timestamp: Date.now()
      }
    } catch (error) {
      logger.error('Binance Public API hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Büyük işlem hacmine sahip coinleri getir
   * @param {number} minVolume - Minimum işlem hacmi (USDT)
   * @param {boolean} usdtOnly - Sadece USDT çiftlerini göster
   */
  async getLargeVolumeCoins(minVolume = 100000, usdtOnly = true) {
    try {
      const result = await this.get24hTickerStats()
      
      if (!result.success) {
        return result
      }

      // Önce USDT çiftlerini filtrele (eğer usdtOnly true ise)
      let filtered = result.data
      if (usdtOnly) {
        filtered = filtered.filter(ticker => ticker.symbol.endsWith('USDT'))
      }

      // Büyük işlem hacmine sahip coinleri filtrele
      const largeVolumeCoins = filtered
        .filter(ticker => ticker.quoteVolume >= minVolume)
        .sort((a, b) => b.quoteVolume - a.quoteVolume) // En yüksek hacimden başla

      return {
        success: true,
        data: largeVolumeCoins,
        count: largeVolumeCoins.length
      }
    } catch (error) {
      logger.error('Large volume coins hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Belirli bir coin için son işlemleri getir (aggTrades)
   * @param {string} symbol - Coin sembolü (örn: BTCUSDT)
   * @param {number} limit - Sonuç sayısı (max 1000)
   */
  async getRecentTrades(symbol, limit = 100) {
    try {
      this.checkRateLimit()

      const response = await fetch(
        `${this.baseUrl}/aggTrades?symbol=${symbol.toUpperCase()}&limit=${Math.min(limit, 1000)}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        }
      )

      if (!response.ok) {
        throw new Error(`Binance API hatası: ${response.status}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        data: data.map(trade => ({
          id: trade.a, // Aggregate trade ID
          price: parseFloat(trade.p),
          quantity: parseFloat(trade.q),
          value: parseFloat(trade.p) * parseFloat(trade.q), // USDT cinsinden değer
          timestamp: trade.T,
          isBuyerMaker: trade.m,
          firstTradeId: trade.f,
          lastTradeId: trade.l
        })),
        count: data.length
      }
    } catch (error) {
      logger.error('Binance recent trades hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Büyük işlemleri tespit et (belirli bir coin için)
   * @param {string} symbol - Coin sembolü
   * @param {number} minValue - Minimum işlem değeri (USDT)
   */
  async getLargeTrades(symbol, minValue = 100000) {
    try {
      const result = await this.getRecentTrades(symbol, 1000)
      
      if (!result.success) {
        return result
      }

      // Büyük işlemleri filtrele
      const largeTrades = result.data
        .filter(trade => trade.value >= minValue)
        .sort((a, b) => b.value - a.value) // En büyük işlemden başla

      return {
        success: true,
        data: largeTrades,
        count: largeTrades.length
      }
    } catch (error) {
      logger.error('Large trades hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Order book depth'i getir (büyük alım/satım emirlerini gösterir)
   * @param {string} symbol - Coin sembolü
   * @param {number} limit - Depth limit (5, 10, 20, 50, 100, 500, 1000, 5000)
   */
  async getOrderBook(symbol, limit = 100) {
    try {
      this.checkRateLimit()

      const response = await fetch(
        `${this.baseUrl}/depth?symbol=${symbol.toUpperCase()}&limit=${limit}`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        }
      )

      if (!response.ok) {
        throw new Error(`Binance API hatası: ${response.status}`)
      }

      const data = await response.json()
      
      // Bid ve ask'leri formatla
      const bids = data.bids.map(bid => ({
        price: parseFloat(bid[0]),
        quantity: parseFloat(bid[1]),
        value: parseFloat(bid[0]) * parseFloat(bid[1])
      }))

      const asks = data.asks.map(ask => ({
        price: parseFloat(ask[0]),
        quantity: parseFloat(ask[1]),
        value: parseFloat(ask[0]) * parseFloat(ask[1])
      }))

      return {
        success: true,
        data: {
          bids: bids.sort((a, b) => b.price - a.price), // En yüksek fiyattan başla
          asks: asks.sort((a, b) => a.price - b.price), // En düşük fiyattan başla
          lastUpdateId: data.lastUpdateId
        }
      }
    } catch (error) {
      logger.error('Binance order book hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: null
      }
    }
  }

  /**
   * Büyük alım/satım emirlerini tespit et
   * @param {string} symbol - Coin sembolü
   * @param {number} minValue - Minimum emir değeri (USDT)
   */
  async getLargeOrders(symbol, minValue = 100000) {
    try {
      const result = await this.getOrderBook(symbol, 500)
      
      if (!result.success || !result.data) {
        return result
      }

      // Büyük bid'leri filtrele (büyük alım emirleri)
      const largeBids = result.data.bids
        .filter(bid => bid.value >= minValue)
        .slice(0, 10) // En büyük 10 alım emri

      // Büyük ask'leri filtrele (büyük satım emirleri)
      const largeAsks = result.data.asks
        .filter(ask => ask.value >= minValue)
        .slice(0, 10) // En büyük 10 satım emri

      return {
        success: true,
        data: {
          largeBids,
          largeAsks,
          symbol
        }
      }
    } catch (error) {
      logger.error('Large orders hatası:', error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: null
      }
    }
  }
}

const binancePublicApi = new BinancePublicApi()
export default binancePublicApi

