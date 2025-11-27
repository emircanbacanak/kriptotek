// KuCoin WebSocket Service for Whale Tracking
// KuCoin WebSocket API üzerinden büyük işlemleri gerçek zamanlı takip eder

import logger from '../utils/logger'

class KuCoinWhaleService {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.subscriptions = new Map() // Map<symbol, Set<callback>>
    this.minTradeValue = 100000 // Minimum $100K trade value
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.publicToken = null
    
    // Popüler coinler için trade stream'leri dinle
    this.trackedSymbols = [
      'BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'XRP-USDT',
      'ADA-USDT', 'DOGE-USDT', 'MATIC-USDT', 'AVAX-USDT', 'DOT-USDT',
      'LINK-USDT', 'UNI-USDT', 'LTC-USDT', 'ATOM-USDT', 'ETC-USDT'
    ]
  }

  /**
   * Public token al (KuCoin WebSocket için gerekli)
   * Backend proxy üzerinden çağrılır (CORS sorunu çözümü)
   */
  async getPublicToken() {
    try {
      // Backend API URL'ini belirle
      const getApiUrl = () => {
        if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
        if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
        if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
          return window.location.origin
        }
        return 'http://localhost:3000'
      }

      const apiUrl = getApiUrl()
      const url = `${apiUrl}/api/kucoin/bullet-public`
      
      logger.log(`🔗 KuCoin token isteniyor: ${url}`)
      
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        })
      } catch (fetchError) {
        // Network hatası (CORS, connection refused, vb.)
        logger.error(`KuCoin token fetch hatası: ${fetchError.message}`)
        throw new Error(`Backend server'a ulaşılamıyor. Lütfen backend server'ın çalıştığından emin olun. (${fetchError.message})`)
      }

      if (!response.ok) {
        let errorText = 'Unknown error'
        try {
          errorText = await response.text()
        } catch (e) {
          // Ignore
        }
        logger.error(`KuCoin API hatası: ${response.status} - ${errorText}`)
        throw new Error(`KuCoin API hatası: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      
      if (result.success && result.data && result.data.code === '200000' && result.data.data) {
        this.publicToken = result.data.data.token
        logger.log('✅ KuCoin token başarıyla alındı')
        return result.data.data.token
      }
      
      throw new Error('KuCoin token alınamadı - Geçersiz yanıt formatı')
    } catch (error) {
      logger.error('KuCoin public token hatası:', error)
      throw error
    }
  }

  /**
   * WebSocket bağlantısını başlat
   */
  async connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Zaten bağlı
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return // Zaten bağlanıyor
    }

    try {
      // Önce public token al (her seferinde yeniden al - token'lar geçici)
      try {
        await this.getPublicToken()
      } catch (tokenError) {
        // Token alma hatası - backend çalışmıyor olabilir
        logger.error('KuCoin token alınamadı, WebSocket bağlantısı kurulamıyor:', tokenError)
        // Yeniden deneme mekanizması attemptReconnect'te çalışacak
        throw tokenError
      }

      // KuCoin WebSocket URL
      const wsUrl = `wss://ws-api-spot.kucoin.com?token=${this.publicToken}&connectId=${Date.now()}`
      
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        logger.log(`✅ KuCoin WebSocket bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
        
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
          logger.error('KuCoin WebSocket mesaj parse hatası:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('KuCoin WebSocket hatası:', error)
      }

      this.ws.onclose = () => {
        this.isConnected = false
        logger.log('📡 KuCoin WebSocket bağlantısı kapatıldı')
        this.attemptReconnect()
      }
    } catch (error) {
      logger.error('KuCoin WebSocket bağlantı hatası:', error)
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

    const subscribeMessage = {
      id: Date.now(),
      type: 'subscribe',
      topic: `/market/match:${symbol}`,
      privateChannel: false,
      response: true
    }

    this.ws.send(JSON.stringify(subscribeMessage))
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ KuCoin WebSocket: Maksimum yeniden bağlanma denemesi aşıldı')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(async () => {
      if (!this.isConnected) {
        logger.log(`🔄 KuCoin WebSocket yeniden bağlanılıyor (deneme ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
        // Token'ı sıfırla (yeniden alınacak)
        this.publicToken = null
        await this.connect()
      }
    }, delay)
  }

  /**
   * WebSocket mesajını işle
   */
  handleMessage(data) {
    // KuCoin match message formatı
    if (data.type === 'message' && data.topic && data.data) {
      const topic = data.topic
      const match = data.data
      
      // Topic'den symbol çıkar (örn: "/market/match:BTC-USDT" -> "BTC-USDT")
      const symbol = topic.split(':')[1]
      if (symbol) {
        this.processTrade(symbol, match)
      }
    }
  }

  /**
   * Trade'i işle ve whale trade'leri tespit et
   */
  processTrade(symbol, match) {
    const price = parseFloat(match.price || 0)
    const size = parseFloat(match.size || 0)
    const tradeValue = price * size // USDT cinsinden işlem değeri

    // Whale trade kontrolü - gerçek zamanlı tek işlem değeri
    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: match.tradeId || `${symbol}_${match.time || Date.now()}`,
        symbol: symbol.replace('-USDT', 'USDT'), // Binance formatına çevir
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(match.time || Date.now())),
        isBuyerMaker: match.side === 'sell', // KuCoin'de side: 'buy' veya 'sell'
        tradeId: match.tradeId,
        source: 'kucoin_realtime',
        type: match.side === 'buy' ? 'buy' : 'sell'
      }

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
          logger.error('KuCoin whale callback hatası:', error)
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
          logger.error('KuCoin whale callback hatası:', error)
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
    this.publicToken = null
  }
}

const kucoinWhaleService = new KuCoinWhaleService()
export default kucoinWhaleService

