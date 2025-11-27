// Binance Real-Time Trade Stream Service
// Gerçek zamanlı tek tek büyük işlemleri takip eder (24 saatlik toplam hacim değil)

import logger from '../utils/logger'

class BinanceRealTimeTrades {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.isConnecting = false // Bağlanma sürecinde mi?
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
   * Binance WebSocket kombinasyon stream kullanarak birden fazla coin'i tek bağlantıda dinle
   */
  connect() {
    // Zaten bağlıysa veya bağlanma sürecindeyse, tekrar bağlanma
    if (this.isConnecting) {
      return // Zaten bağlanma sürecinde
    }
    
    if (this.ws) {
      const readyState = this.ws.readyState
      if (readyState === WebSocket.OPEN) {
        this.isConnected = true
        this.isConnecting = false
        return // Zaten bağlı
      }
      if (readyState === WebSocket.CONNECTING) {
        this.isConnecting = true
        return // Zaten bağlanıyor
      }
      // CLOSING veya CLOSED durumunda, eski bağlantıyı temizle
      if (readyState === WebSocket.CLOSING || readyState === WebSocket.CLOSED) {
        try {
          this.ws.close()
        } catch (e) {
          // Ignore
        }
        this.ws = null
        this.isConnected = false
        this.isConnecting = false
      }
    }
    
    this.isConnecting = true

    try {
      // Binance kombinasyon stream URL'i oluştur
      // Format: wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/...
      const streams = this.trackedSymbols
        .map(symbol => `${symbol.toLowerCase()}@trade`)
        .join('/')
      
      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`
      
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.isConnecting = false
        this.reconnectAttempts = 0
        logger.log(`✅ Binance Real-Time Trade Stream bağlantısı kuruldu (${this.trackedSymbols.length} coin)`)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          logger.error('Binance Trade Stream mesaj parse hatası:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('Binance Trade Stream hatası:', error)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        this.isConnecting = false
        // Eğer normal kapanış değilse (code 1000) yeniden bağlanmayı dene
        if (event.code !== 1000) {
          logger.log('📡 Binance Trade Stream bağlantısı kapatıldı, yeniden bağlanılıyor...')
          this.attemptReconnect()
        } else {
          logger.log('📡 Binance Trade Stream bağlantısı kapatıldı')
        }
      }
    } catch (error) {
      this.isConnecting = false
      logger.error('Binance Trade Stream bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('❌ Binance Trade Stream: Maksimum yeniden bağlanma denemesi aşıldı')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(() => {
      if (!this.isConnected) {
        logger.log(`🔄 Binance Trade Stream yeniden bağlanılıyor (deneme ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
        this.connect()
      }
    }, delay)
  }

  /**
   * WebSocket mesajını işle
   */
  handleMessage(data) {
    // Binance kombinasyon stream formatı: { stream: "btcusdt@trade", data: { ... } }
    if (data.stream && data.data) {
      const stream = data.stream
      const trade = data.data
      
      // Stream'den symbol çıkar (örn: "btcusdt@trade" -> "BTCUSDT")
      const symbol = stream.split('@')[0].toUpperCase()
      this.processTrade(symbol, trade)
    }
  }

  /**
   * Trade'i işle ve whale trade'leri tespit et
   */
  processTrade(symbol, trade) {
    const price = parseFloat(trade.p || 0)
    const quantity = parseFloat(trade.q || 0)
    const tradeValue = price * quantity // USDT cinsinden işlem değeri

    // Whale trade kontrolü - gerçek zamanlı tek işlem değeri
    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.t || trade.a || `${symbol}_${trade.T}`, // Trade ID
        symbol,
        price,
        quantity,
        tradeValue, // Gerçek zamanlı tek işlem değeri
        timestamp: new Date(trade.T || Date.now()),
        isBuyerMaker: trade.m || false, // true = satış, false = alış
        tradeId: trade.t || trade.a,
        source: 'binance_realtime',
        type: trade.m ? 'sell' : 'buy'
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
          logger.error('Binance real-time trade callback hatası:', error)
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
          logger.error('Binance real-time trade callback hatası:', error)
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
    this.isConnecting = false
    if (this.ws) {
      // WebSocket durumunu kontrol et
      const readyState = this.ws.readyState
      if (readyState === WebSocket.OPEN || readyState === WebSocket.CONNECTING) {
        try {
          this.ws.close(1000, 'Normal closure') // Normal kapanış kodu
        } catch (error) {
          // Zaten kapanmış olabilir, sessizce geç
        }
      }
      this.ws = null
    }
    this.isConnected = false
    this.subscriptions.clear()
  }
}

const binanceRealTimeTrades = new BinanceRealTimeTrades()
export default binanceRealTimeTrades

