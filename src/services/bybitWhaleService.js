// Bybit WebSocket Service for Whale Tracking
// Bybit WebSocket API üzerinden büyük işlemleri gerçek zamanlı takip eder

import logger from '../utils/logger'

class BybitWhaleService {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.subscriptions = new Map() // Map<symbol, Set<callback>>
    this.minTradeValue = 100000 // Minimum $100K trade value
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    
    // Popüler coinler için trade stream'leri dinle
    this.trackedSymbols = [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
      'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'AVAXUSDT', 'DOTUSDT',
      'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'ETCUSDT'
    ]
  }

  /**
   * WebSocket bağlantısını başlat
   */
  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Zaten bağlı
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return // Zaten bağlanıyor
    }

    try {
      // Bybit Public WebSocket URL
      const wsUrl = 'wss://stream.bybit.com/v5/public/spot'
      logger.log(`🔗 Bybit WebSocket bağlantısı kuruluyor: ${wsUrl}`)
      console.log(`🔗 Bybit WebSocket bağlantısı kuruluyor: ${wsUrl}`)
      
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        logger.log(`✅ Bybit WebSocket bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
        console.log(`✅ Bybit WebSocket bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
        
        // Her coin için trade stream'lerini subscribe et
        this.trackedSymbols.forEach(symbol => {
          this.subscribeToSymbol(symbol)
        })
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          logger.error('Bybit WebSocket mesaj parse hatası:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('Bybit WebSocket hatası:', error)
        console.error('❌ Bybit WebSocket hatası:', error)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        logger.log('📡 Bybit WebSocket bağlantısı kapatıldı')
        console.log(`📡 Bybit WebSocket bağlantısı kapatıldı (code: ${event.code}, reason: ${event.reason || 'none'})`)
        this.attemptReconnect()
      }
    } catch (error) {
      logger.error('Bybit WebSocket bağlantı hatası:', error)
      console.error('❌ Bybit WebSocket bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  /**
   * Belirli bir coin için trade stream'ine subscribe ol
   */
  subscribeToSymbol(symbol) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    // Bybit v5 format: { op: "subscribe", args: ["publicTrade.BTCUSDT"] }
    const subscribeMessage = {
      op: 'subscribe',
      args: [`publicTrade.${symbol}`]
    }

    console.log(`📡 Bybit subscribe: ${symbol}`, subscribeMessage)
    this.ws.send(JSON.stringify(subscribeMessage))
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Bybit WebSocket: Maksimum yeniden bağlanma denemesi aşıldı')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(() => {
      if (!this.isConnected) {
        logger.log(`🔄 Bybit WebSocket yeniden bağlanılıyor (deneme ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
        this.connect()
      }
    }, delay)
  }

  /**
   * WebSocket mesajını işle
   */
  handleMessage(data) {
    // Debug: Tüm mesajları logla (ilk birkaç mesaj için)
    if (this.debugCount === undefined) this.debugCount = 0
    if (this.debugCount < 3) {
      console.log('📨 Bybit mesaj:', JSON.stringify(data, null, 2))
      this.debugCount++
    }
    
    // Bybit v5 message formatı: { topic: "publicTrade.BTCUSDT", type: "snapshot"|"delta", data: [...] }
    if (data.topic && data.topic.startsWith('publicTrade.') && data.data) {
      const symbol = data.topic.replace('publicTrade.', '')
      const trades = Array.isArray(data.data) ? data.data : [data.data]
      
      trades.forEach(trade => {
        this.processTrade(symbol, trade)
      })
    }
  }

  /**
   * Trade'i işle ve whale trade'leri tespit et
   */
  processTrade(symbol, trade) {
    // Bybit v5 format: { p: "price", v: "volume", S: "Buy"/"Sell", i: "tradeId", T: timestamp }
    const price = parseFloat(trade.p || trade.price || 0)
    const size = parseFloat(trade.v || trade.size || trade.q || 0)
    const tradeValue = price * size // USDT cinsinden işlem değeri

    // Debug: İlk birkaç trade'i logla
    if (this.tradeDebugCount === undefined) this.tradeDebugCount = 0
    if (this.tradeDebugCount < 2) {
      console.log(`📊 Bybit trade: ${symbol}`, { price, size, tradeValue, trade })
      this.tradeDebugCount++
    }

    // Whale trade kontrolü - gerçek zamanlı tek işlem değeri
    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.i || trade.tradeId || `${symbol}_${trade.T || Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.T || trade.ts || Date.now())),
        isBuyerMaker: (trade.S || trade.side) === 'Sell', // Bybit'te S: 'Buy' veya 'Sell'
        tradeId: trade.i || trade.tradeId,
        source: 'bybit_realtime',
        type: (trade.S || trade.side) === 'Buy' ? 'buy' : 'sell'
      }

      console.log(`🐋 Bybit whale trade: ${symbol} - $${tradeValue.toLocaleString()}`)
      // Tüm abonelere bildir
      this.notifySubscribers(symbol, whaleTrade)
    }
  }

  /**
   * Belirli bir coin için whale trade'leri dinle
   */
  subscribe(symbol, callback) {
    const upperSymbol = symbol.toUpperCase()
    
    if (!this.subscriptions.has(upperSymbol)) {
      this.subscriptions.set(upperSymbol, new Set())
    }

    this.subscriptions.get(upperSymbol).add(callback)

    // Bağlı değilse bağlan
    if (!this.isConnected) {
      this.connect()
    }

    // Unsubscribe fonksiyonu
    return () => {
      const callbacks = this.subscriptions.get(upperSymbol)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.subscriptions.delete(upperSymbol)
        }
      }
    }
  }

  /**
   * Tüm coin'ler için whale trade'leri dinle
   */
  subscribeAll(callback) {
    return this.subscribe('ALL', callback)
  }

  /**
   * Abonelere bildir
   */
  notifySubscribers(symbol, whaleTrade) {
    // Belirli coin aboneleri
    const symbolCallbacks = this.subscriptions.get(symbol)
    if (symbolCallbacks) {
      symbolCallbacks.forEach(callback => {
        try {
          callback(whaleTrade)
        } catch (error) {
          logger.error('Bybit whale callback hatası:', error)
        }
      })
    }

    // Tüm coin aboneleri
    const allCallbacks = this.subscriptions.get('ALL')
    if (allCallbacks) {
      allCallbacks.forEach(callback => {
        try {
          callback(whaleTrade)
        } catch (error) {
          logger.error('Bybit whale callback hatası:', error)
        }
      })
    }
  }

  /**
   * Minimum trade değerini ayarla
   */
  setMinTradeValue(value) {
    this.minTradeValue = value
  }

  /**
   * WebSocket bağlantısını kapat
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.subscriptions.clear()
  }
}

const bybitWhaleService = new BybitWhaleService()
export default bybitWhaleService

