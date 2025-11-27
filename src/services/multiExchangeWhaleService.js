// Multi-Exchange Whale Service
// Tüm borsalardan periyodik olarak (her dakika) büyük trade'leri çeker

import logger from '../utils/logger'

class MultiExchangeWhaleService {
  constructor() {
    this.intervalId = null
    this.isRunning = false
    this.minTradeValue = 200000 // Minimum $200K trade value
    this.updateInterval = 60000 // 60 saniye (1 dakika)
    this.callbacks = new Set()
    
    // Popüler coinler
    this.trackedSymbols = [
      'BTC', 'ETH', 'BNB', 'SOL', 'XRP',
      'ADA', 'DOGE', 'MATIC', 'AVAX', 'DOT',
      'LINK', 'UNI', 'LTC', 'ATOM', 'ETC'
    ]
  }

  /**
   * API URL'ini belirle
   */
  getApiUrl() {
    if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
    if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
    if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
      return window.location.origin
    }
    return 'http://localhost:3000'
  }

  /**
   * Backend'den whale trade'leri çek (tüm borsalardan)
   */
  async fetchAllWhalesFromBackend() {
    try {
      const apiUrl = this.getApiUrl()
      const response = await fetch(`${apiUrl}/api/whale/recent-trades?minValue=${this.minTradeValue}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000)
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.trades) {
          return data.trades.map(trade => ({
            ...trade,
            timestamp: trade.timestamp ? new Date(trade.timestamp) : new Date(),
            source: trade.source || 'unknown'
          }))
        }
      } else {
        console.warn('Whale trade fetch hatası:', response.status)
      }
    } catch (error) {
      console.error('Backend whale fetch hatası:', error)
    }
    return []
  }

  /**
   * Tüm borsalardan büyük trade'leri çek (Backend'den)
   */
  async fetchAllWhales() {
    console.log(`🔍 Whale trade'leri çekiliyor (Min: $${this.minTradeValue.toLocaleString()})...`)
    
    try {
      // Backend'den tüm whale trade'leri çek
      const allTrades = await this.fetchAllWhalesFromBackend()

      // Minimum değer filtresini uygula (ekstra güvenlik)
      const filteredTrades = allTrades.filter(trade => {
        const tradeValue = trade.tradeValue || (trade.price * trade.quantity || 0)
        return tradeValue >= this.minTradeValue
      })

      console.log(`✅ ${filteredTrades.length} whale trade bulundu (Min: $${this.minTradeValue.toLocaleString()})`)

      // Tüm callback'lere bildir
      this.callbacks.forEach(callback => {
        try {
          filteredTrades.forEach(trade => callback(trade))
        } catch (error) {
          console.error('Multi-exchange whale callback hatası:', error)
        }
      })

      return filteredTrades
    } catch (error) {
      console.error('❌ Whale fetch hatası:', error)
      return []
    }
  }

  /**
   * Periyodik kontrolü başlat
   */
  start() {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    console.log(`🚀 Multi-exchange whale tracking başlatıldı (Her ${this.updateInterval / 1000} saniyede bir, Min: $${this.minTradeValue.toLocaleString()})`)

    // Hemen bir kez çek
    this.fetchAllWhales()

    // Sonra periyodik olarak çek
    this.intervalId = setInterval(() => {
      this.fetchAllWhales()
    }, this.updateInterval)
  }

  /**
   * Periyodik kontrolü durdur
   */
  stop() {
    if (!this.isRunning) {
      return
    }

    this.isRunning = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    console.log('🛑 Multi-exchange whale tracking durduruldu')
  }

  /**
   * Trade callback'ini ekle
   */
  subscribe(callback) {
    this.callbacks.add(callback)
    
    // Unsubscribe fonksiyonu
    return () => {
      this.callbacks.delete(callback)
    }
  }

  /**
   * Minimum trade değerini ayarla
   */
  setMinTradeValue(value) {
    this.minTradeValue = value
    console.log(`💰 Minimum trade değeri güncellendi: $${value.toLocaleString()}`)
  }

  /**
   * Çalışıyor mu kontrol et
   */
  get isConnected() {
    return this.isRunning
  }
}

const multiExchangeWhaleService = new MultiExchangeWhaleService()
export default multiExchangeWhaleService

