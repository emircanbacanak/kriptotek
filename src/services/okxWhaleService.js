// OKX (OKEx) WebSocket Service for Whale Tracking
// OKX WebSocket API üzerinden büyük işlemleri gerçek zamanlı takip eder

import logger from '../utils/logger'

class OKXWhaleService {
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
      'BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'XRP-USDT',
      'ADA-USDT', 'DOGE-USDT', 'MATIC-USDT', 'AVAX-USDT', 'DOT-USDT',
      'LINK-USDT', 'UNI-USDT', 'LTC-USDT', 'ATOM-USDT', 'ETC-USDT'
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
      // OKX Public WebSocket URL
      const wsUrl = 'wss://ws.okx.com:8443/ws/v5/public'
      logger.log(`🔗 OKX WebSocket bağlantısı kuruluyor: ${wsUrl}`)
      console.log(`🔗 OKX WebSocket bağlantısı kuruluyor: ${wsUrl}`)
      
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        logger.log(`✅ OKX WebSocket bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
        console.log(`✅ OKX WebSocket bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
        
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
          logger.error('OKX WebSocket mesaj parse hatası:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('OKX WebSocket hatası:', error)
        console.error('❌ OKX WebSocket hatası:', error)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        logger.log('📡 OKX WebSocket bağlantısı kapatıldı')
        console.log(`📡 OKX WebSocket bağlantısı kapatıldı (code: ${event.code}, reason: ${event.reason || 'none'})`)
        this.attemptReconnect()
      }
    } catch (error) {
      logger.error('OKX WebSocket bağlantı hatası:', error)
      console.error('❌ OKX WebSocket bağlantı hatası:', error)
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

    // OKX v5 format: { op: "subscribe", args: [{ channel: "trades", instId: "BTC-USDT" }] }
    const subscribeMessage = {
      op: 'subscribe',
      args: [{
        channel: 'trades',
        instId: symbol
      }]
    }

    console.log(`📡 OKX subscribe: ${symbol}`, subscribeMessage)
    this.ws.send(JSON.stringify(subscribeMessage))
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ OKX WebSocket: Maksimum yeniden bağlanma denemesi aşıldı')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(() => {
      if (!this.isConnected) {
        logger.log(`🔄 OKX WebSocket yeniden bağlanılıyor (deneme ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
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
      console.log('📨 OKX mesaj:', JSON.stringify(data, null, 2))
      this.debugCount++
    }
    
    // OKX v5 message formatı: { arg: { channel: "trades", instId: "BTC-USDT" }, data: [...] }
    if (data.arg && data.arg.channel === 'trades' && data.data) {
      const symbol = data.arg.instId
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
    // OKX v5 format: { px: "price", sz: "size", side: "buy"/"sell", tradeId: "...", ts: "timestamp" }
    const price = parseFloat(trade.px || trade.p || 0)
    const size = parseFloat(trade.sz || trade.size || trade.q || 0)
    const tradeValue = price * size // USDT cinsinden işlem değeri

    // Debug: İlk birkaç trade'i logla
    if (this.tradeDebugCount === undefined) this.tradeDebugCount = 0
    if (this.tradeDebugCount < 2) {
      console.log(`📊 OKX trade: ${symbol}`, { price, size, tradeValue, trade })
      this.tradeDebugCount++
    }

    // Whale trade kontrolü - gerçek zamanlı tek işlem değeri
    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.tradeId || trade.instId || `${symbol}_${trade.ts || Date.now()}`,
        symbol: symbol.replace('-USDT', 'USDT'), // Binance formatına çevir
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.ts || Date.now())),
        isBuyerMaker: trade.side === 'sell', // OKX'te side: 'buy' veya 'sell'
        tradeId: trade.tradeId || trade.instId,
        source: 'okx_realtime',
        type: trade.side === 'buy' ? 'buy' : 'sell'
      }

      console.log(`🐋 OKX whale trade: ${symbol} - $${tradeValue.toLocaleString()}`)
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
          logger.error('OKX whale callback hatası:', error)
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
          logger.error('OKX whale callback hatası:', error)
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

const okxWhaleService = new OKXWhaleService()
export default okxWhaleService

