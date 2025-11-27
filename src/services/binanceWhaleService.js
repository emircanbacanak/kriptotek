// Binance WebSocket Service for Whale Tracking
// Binance WebSocket API üzerinden büyük işlemleri gerçek zamanlı takip eder

import logger from '../utils/logger'

class BinanceWhaleService {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.subscriptions = new Map() // Map<symbol, Set<callback>>
    this.minTradeValue = 100000 // Minimum $100K trade value
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 3000
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
      // Binance WebSocket Stream URL - Tüm coin'lerin ticker'larını al
      // Alternatif: Belirli coin'ler için stream kombinasyonu kullanılabilir
      const wsUrl = 'wss://stream.binance.com:9443/ws/!ticker@arr'
      
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        logger.log('✅ Binance WebSocket bağlantısı kuruldu')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          logger.error('Binance WebSocket mesaj parse hatası:', error)
        }
      }

      this.ws.onerror = (error) => {
        logger.error('Binance WebSocket hatası:', error)
      }

      this.ws.onclose = () => {
        this.isConnected = false
        logger.log('📡 Binance WebSocket bağlantısı kapatıldı')
        this.attemptReconnect()
      }
    } catch (error) {
      logger.error('Binance WebSocket bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  /**
   * WebSocket mesajını işle
   */
  handleMessage(data) {
    // Binance ticker array formatı
    if (Array.isArray(data)) {
      data.forEach(ticker => {
        this.processTicker(ticker)
      })
    } else if (data.e === '24hrTicker') {
      // Tek ticker güncellemesi
      this.processTicker(data)
    }
  }

  /**
   * Ticker'ı işle ve whale trade'leri tespit et
   */
  processTicker(ticker) {
    const symbol = ticker.s || ticker.symbol
    const price = parseFloat(ticker.c || ticker.lastPrice || 0)
    const volume = parseFloat(ticker.v || ticker.volume || 0)
    const quoteVolume = parseFloat(ticker.q || ticker.quoteVolume || 0)

    // Trade değeri hesapla (USDT cinsinden)
    // quoteVolume = 24 saatlik toplam işlem hacmi (USDT)
    // Bu değeri whale trade olarak kabul edebiliriz
    const tradeValue = quoteVolume || (volume * price)

    // Whale trade kontrolü - 24 saatlik hacim bazlı
    // Minimum değer: $100K (24 saatlik toplam hacim)
    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        symbol,
        price,
        volume24h: volume,
        tradeValue24h: tradeValue, // 24 saatlik toplam hacim
        priceChange: parseFloat(ticker.P || ticker.priceChangePercent || 0),
        high24h: parseFloat(ticker.h || ticker.highPrice || 0),
        low24h: parseFloat(ticker.l || ticker.lowPrice || 0),
        timestamp: new Date(),
        source: 'binance',
        type: 'large_volume' // Binance'den gelen veri tipi
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
          logger.error('Binance whale callback hatası:', error)
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
          logger.error('Binance whale callback hatası:', error)
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

const binanceWhaleService = new BinanceWhaleService()
export default binanceWhaleService

