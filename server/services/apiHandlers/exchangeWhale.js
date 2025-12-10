/**
 * Exchange Whale Trade Handler
 * Binance, Bybit, KuCoin, OKX, Bitget, Gate.io, HTX, MEXC ve Kraken'den gerçek zamanlı whale trade'leri çeker
 */

import WebSocket from 'ws'
import { gunzipSync } from 'zlib'

const MIN_TRADE_VALUE = 200000 // Minimum $200K

// Popüler coinler
const TRACKED_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
  'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'AVAXUSDT', 'DOTUSDT',
  'LINKUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'ETCUSDT'
]

/**
 * Binance WebSocket'ten whale trade'leri çek
 */
class BinanceWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      // Binance kombinasyon stream URL'i
      const streams = TRACKED_SYMBOLS
        .map(symbol => `${symbol.toLowerCase()}@trade`)
        .join('/')

      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`

      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('Binance whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('Binance whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        // Binance WebSocket otomatik ping/pong yönetir, manuel ping gerekmez
        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('Binance whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ Binance whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye


    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    if (message.stream && message.data) {
      const symbol = message.stream.split('@')[0].toUpperCase()
      const trade = message.data
      this.processTrade(symbol, trade)
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.p || 0)
    const quantity = parseFloat(trade.q || 0)
    const tradeValue = price * quantity

    if (tradeValue >= this.minTradeValue) {
      const tradeTimestamp = trade.T || Date.now()
      const whaleTrade = {
        id: trade.t || trade.a || `${symbol}_${tradeTimestamp}`,
        symbol,
        price,
        quantity,
        tradeValue,
        timestamp: new Date(tradeTimestamp),
        isBuyerMaker: trade.m || false,
        tradeId: trade.t || trade.a,
        source: 'binance_realtime',
        type: trade.m ? 'sell' : 'buy'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      // Duplicate kontrolü
      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return // Zaten var
      }

      // 24 saat öncesini hesapla
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)

      // Eski trade'leri temizle
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      // Trade'i serialize et (Date objelerini timestamp'e çevir)
      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      // Yeni trade'i başa ekle
      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )


      // WebSocket'e broadcast et
      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('Binance whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * Bybit WebSocket'ten whale trade'leri çek
 */
class BybitWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://stream.bybit.com/v5/public/spot'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Her coin için subscribe
        TRACKED_SYMBOLS.forEach(symbol => {
          const subscribeMessage = {
            op: 'subscribe',
            args: [`publicTrade.${symbol}`]
          }
          this.ws.send(JSON.stringify(subscribeMessage))
        })

        // Bybit ping mekanizması (her 20 saniyede bir)
        this.startPing()
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('Bybit whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('Bybit whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('Bybit whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ Bybit whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye


    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // Bybit ping/pong kontrolü
    if (message.op === 'pong') {
      return
    }

    // Trade mesajları
    if (message.topic && message.topic.startsWith('publicTrade.') && message.data) {
      const symbol = message.topic.replace('publicTrade.', '')
      const trades = Array.isArray(message.data) ? message.data : [message.data]

      trades.forEach(trade => {
        this.processTrade(symbol, trade)
      })
    }
  }

  startPing() {
    this.stopPing()
    // Bybit: Her 20 saniyede bir ping gönder
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = { op: 'ping' }
        this.ws.send(JSON.stringify(pingMessage))
      }
    }, 20000)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.p || trade.price || 0)
    const size = parseFloat(trade.v || trade.size || trade.q || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.i || trade.tradeId || `${symbol}_${trade.T || Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.T || trade.ts || Date.now())),
        isBuyerMaker: (trade.S || trade.side) === 'Sell',
        tradeId: trade.i || trade.tradeId,
        source: 'bybit_realtime',
        type: (trade.S || trade.side) === 'Buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      // Trade'i serialize et (Date objelerini timestamp'e çevir)
      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      // WebSocket'e broadcast et
      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('Bybit whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * KuCoin WebSocket'ten whale trade'leri çek
 */
class KuCoinWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.publicToken = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
    this.trackedSymbols = TRACKED_SYMBOLS.map(s => s.replace('USDT', '-USDT')) // BTC-USDT formatı
  }

  async getPublicToken() {
    try {
      const { fetch } = await import('undici')
      const response = await fetch('https://openapi-v2.kucoin.com/api/v1/bullet-public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`KuCoin API hatası: ${response.status}`)
      }

      const result = await response.json()

      if (result.code === '200000' && result.data && result.data.token) {
        this.publicToken = result.data.token
        return result.data.token
      }

      throw new Error('KuCoin token alınamadı - Geçersiz yanıt formatı')
    } catch (error) {
      console.error('KuCoin public token hatası:', error)
      throw error
    }
  }

  async connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      // Önce public token al
      try {
        await this.getPublicToken()
      } catch (tokenError) {
        console.error('KuCoin token alınamadı:', tokenError)
        this.attemptReconnect()
        return
      }

      const wsUrl = `wss://ws-api-spot.kucoin.com?token=${this.publicToken}&connectId=${Date.now()}`
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Her coin için subscribe
        this.trackedSymbols.forEach(symbol => {
          const subscribeMessage = {
            id: Date.now(),
            type: 'subscribe',
            topic: `/market/match:${symbol}`,
            privateChannel: false,
            response: true
          }
          this.ws.send(JSON.stringify(subscribeMessage))
        })

        // KuCoin ping mekanizması (her 15 saniyede bir)
        this.startPing()
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('KuCoin whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('KuCoin whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.publicToken = null // Token'ı sıfırla, yeniden alınacak
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        // Eğer normal kapanma değilse reconnect dene
        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('KuCoin whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000)

    setTimeout(async () => {
      if (!this.isConnected) {
        this.publicToken = null // Token'ı sıfırla
        await this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // KuCoin ping/pong kontrolü
    if (message.type === 'pong') {
      return
    }
    if (message.type === 'ping') {
      const pongMessage = { id: message.id || Date.now(), type: 'pong' }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(pongMessage))
      }
      return
    }

    // Trade mesajları
    if (message.type === 'message' && message.topic && message.data) {
      const topic = message.topic
      const match = message.data
      const symbol = topic.split(':')[1]

      if (symbol) {
        this.processTrade(symbol, match)
      }
    }
  }

  startPing() {
    this.stopPing()
    // KuCoin: Her 15 saniyede bir ping gönder
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = { id: Date.now(), type: 'ping' }
        this.ws.send(JSON.stringify(pingMessage))
      }
    }, 15000)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, match) {
    const price = parseFloat(match.price || 0)
    const size = parseFloat(match.size || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: match.tradeId || `${symbol}_${match.time || Date.now()}`,
        symbol: symbol.replace('-USDT', 'USDT'), // Binance formatına çevir
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(match.time || Date.now())),
        isBuyerMaker: match.side === 'sell',
        tradeId: match.tradeId,
        source: 'kucoin_realtime',
        type: match.side === 'buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )


      // WebSocket'e broadcast et
      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('KuCoin whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.publicToken = null
  }
}

/**
 * OKX WebSocket'ten whale trade'leri çek
 */
class OKXWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
    this.trackedSymbols = TRACKED_SYMBOLS.map(s => s.replace('USDT', '-USDT')) // BTC-USDT formatı
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://ws.okx.com:8443/ws/v5/public'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Her coin için subscribe
        this.trackedSymbols.forEach(symbol => {
          const subscribeMessage = {
            op: 'subscribe',
            args: [{
              channel: 'trades',
              instId: symbol
            }]
          }
          this.ws.send(JSON.stringify(subscribeMessage))
        })

        // OKX ping mekanizması (her 20 saniyede bir)
        this.startPing()
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('OKX whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('OKX whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('OKX whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ OKX whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // OKX ping/pong kontrolü
    if (message.event === 'pong') {
      return
    }

    // Trade mesajları
    if (message.arg && message.arg.channel === 'trades' && message.data) {
      const symbol = message.arg.instId
      const trades = Array.isArray(message.data) ? message.data : [message.data]

      trades.forEach(trade => {
        this.processTrade(symbol, trade)
      })
    }
  }

  startPing() {
    this.stopPing()
    // OKX: Her 20 saniyede bir ping gönder
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = { op: 'ping' }
        this.ws.send(JSON.stringify(pingMessage))
      }
    }, 20000)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.px || trade.p || 0)
    const size = parseFloat(trade.sz || trade.size || trade.q || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.tradeId || trade.instId || `${symbol}_${trade.ts || Date.now()}`,
        symbol: symbol.replace('-USDT', 'USDT'), // Binance formatına çevir
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.ts || Date.now())),
        isBuyerMaker: trade.side === 'sell',
        tradeId: trade.tradeId || trade.instId,
        source: 'okx_realtime',
        type: trade.side === 'buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      // WebSocket'e broadcast et
      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('OKX whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * Bitget WebSocket'ten whale trade'leri çek
 */
class BitgetWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://ws.bitget.com/v2/ws/public'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Bitget ping mekanizmasını önce başlat (subscribe'den önce)
        this.startPing()

        // Bitget: Subscribe'ları yavaşça gönder (rate limit: saatte 240 subscribe)
        // Her subscribe arasında 200ms gecikme, ilk subscribe 500ms sonra
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Her coin için subscribe
            TRACKED_SYMBOLS.forEach((symbol, index) => {
              setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  try {
                    const subscribeMessage = {
                      op: 'subscribe',
                      args: [{
                        instType: 'SPOT',
                        channel: 'trade',
                        instId: symbol
                      }]
                    }
                    this.ws.send(JSON.stringify(subscribeMessage))
                  } catch (error) {
                    console.error(`Bitget subscribe hatası (${symbol}):`, error)
                  }
                }
              }, index * 200) // Her subscribe arasında 200ms gecikme (rate limit için)
            })
          }
        }, 500) // İlk subscribe 500ms sonra
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('Bitget whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('Bitget whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('Bitget whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ Bitget whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // Bitget ping/pong kontrolü
    if (message.op === 'pong' || message.event === 'pong') {
      return
    }

    // Subscribe yanıtı kontrolü
    if (message.event === 'subscribe' || (message.op === 'subscribe' && message.code === '0')) {
      // Subscribe başarılı
      return
    }

    // Trade mesajları
    if (message.arg && message.arg.channel === 'trade' && message.data) {
      const symbol = message.arg.instId
      const trades = Array.isArray(message.data) ? message.data : [message.data]

      trades.forEach(trade => {
        this.processTrade(symbol, trade)
      })
    }
  }

  startPing() {
    this.stopPing()
    // Bitget: Her 25 saniyede bir ping gönder (dokümantasyona göre 30 saniye, ama güvenlik için 25)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const pingMessage = { op: 'ping' }
          this.ws.send(JSON.stringify(pingMessage))
        } catch (error) {
          // Ping gönderme hatası - sessizce atla
        }
      }
    }, 25000) // 25 saniye - Bitget dokümantasyonuna göre 30 saniye, ama güvenlik için 25
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.px || trade.p || trade.price || 0)
    const size = parseFloat(trade.sz || trade.size || trade.q || trade.v || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.ts || trade.tradeId || `${symbol}_${Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.ts || Date.now())),
        isBuyerMaker: (trade.side || trade.S) === 'sell',
        tradeId: trade.ts || trade.tradeId,
        source: 'bitget_realtime',
        type: (trade.side || trade.S) === 'buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      // WebSocket'e broadcast et
      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('Bitget whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * Gate.io WebSocket'ten whale trade'leri çek
 */
class GateIOWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://api.gateio.ws/ws/v4/'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Her coin için subscribe
        TRACKED_SYMBOLS.forEach(symbol => {
          const subscribeMessage = {
            time: Math.floor(Date.now() / 1000),
            channel: 'spot.trades',
            event: 'subscribe',
            payload: [symbol]
          }
          this.ws.send(JSON.stringify(subscribeMessage))
        })

        // Gate.io ping mekanizması (her 30 saniyede bir)
        this.startPing()
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('Gate.io whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('Gate.io whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        // Eğer normal kapanma değilse reconnect dene
        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('Gate.io whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ Gate.io whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // Gate.io ping/pong kontrolü
    if (message.event === 'pong') {
      return
    }

    // Trade mesajları
    if (message.channel === 'spot.trades' && message.result) {
      const trades = Array.isArray(message.result) ? message.result : [message.result]
      const symbol = message.result?.[0]?.currency_pair || message.result?.currency_pair

      if (symbol) {
        trades.forEach(trade => {
          this.processTrade(symbol, trade)
        })
      }
    }
  }

  startPing() {
    this.stopPing()
    // Gate.io: Her 30 saniyede bir ping gönder
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = {
          time: Math.floor(Date.now() / 1000),
          channel: 'spot.ping',
          event: 'ping'
        }
        this.ws.send(JSON.stringify(pingMessage))
      }
    }, 30000)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.price || 0)
    const size = parseFloat(trade.amount || trade.quantity || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.id || trade.trade_id || `${symbol}_${trade.create_time || Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.create_time || trade.time || Date.now()) * 1000),
        isBuyerMaker: trade.side === 'sell',
        tradeId: trade.id || trade.trade_id,
        source: 'gateio_realtime',
        type: trade.side === 'buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('Gate.io whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * HTX (Huobi) WebSocket'ten whale trade'leri çek
 */
class HTXWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://api.huobi.pro/ws'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // Her coin için subscribe (HTX format: btcusdt - USDT'yi kaldır)
        TRACKED_SYMBOLS.forEach(symbol => {
          const baseSymbol = symbol.replace('USDT', '').toLowerCase() // BTCUSDT -> btc
          const subscribeMessage = {
            sub: `market.${baseSymbol}usdt.trade.detail`,
            id: `id_${symbol}_${Date.now()}`
          }
          this.ws.send(JSON.stringify(subscribeMessage))
        })

        // Ping mekanizması başlat (HTX ping check expired hatası için)
        this.startPing()
      })

      this.ws.on('message', (data) => {
        try {
          // HTX WebSocket gzip compressed mesajlar gönderir
          let decompressedData
          try {
            // Önce gzip decompress dene
            decompressedData = gunzipSync(data)
          } catch (gzipError) {
            // Gzip değilse direkt string olarak kullan
            decompressedData = data
          }

          const messageStr = decompressedData.toString('utf-8')

          // Boş mesajları atla
          if (!messageStr || messageStr.trim() === '') {
            return
          }

          const message = JSON.parse(messageStr)
          this.handleMessage(message)
        } catch (error) {
          // Sessizce atla - çok fazla log spam olmasın
          // console.error('HTX whale message parse hatası:', error.message)
        }
      })

      this.ws.on('error', (error) => {
        console.error('HTX whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        // Eğer normal kapanma değilse reconnect dene
        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('HTX whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ HTX whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye

    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // Ping yanıtı kontrolü
    if (message.ping) {
      const pongMessage = { pong: message.ping }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(pongMessage))
      }
      return
    }

    // Trade mesajları
    if (message.ch && message.ch.includes('trade.detail') && message.tick && message.tick.data) {
      // Symbol'ü doğru parse et: market.btcusdt.trade.detail -> BTCUSDT
      const channelParts = message.ch.split('.')
      if (channelParts.length >= 2) {
        const symbolPair = channelParts[1].toUpperCase() // btcusdt -> BTCUSDT
        const trades = Array.isArray(message.tick.data) ? message.tick.data : [message.tick.data]

        trades.forEach(trade => {
          this.processTrade(symbolPair, trade)
        })
      }
    }
  }

  startPing() {
    // Ping mekanizmasını durdur (varsa)
    this.stopPing()

    // HTX: Sunucu her 5 saniyede ping gönderir, biz pong yanıtı veriyoruz
    // Ekstra ping göndermeye gerek yok, sadece pong yanıtı yeterli
    // Ama güvenlik için her 30 saniyede bir ping gönderebiliriz
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = { ping: Date.now() }
        this.ws.send(JSON.stringify(pingMessage))
      }
    }, 30000) // 30 saniye (HTX sunucu zaten 5 saniyede bir ping gönderiyor)
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.price || trade.p || 0)
    const size = parseFloat(trade.amount || trade.vol || trade.qty || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.id || trade.tradeId || `${symbol}_${trade.ts || Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.ts || Date.now())),
        isBuyerMaker: trade.direction === 'sell',
        tradeId: trade.id || trade.tradeId,
        source: 'htx_realtime',
        type: trade.direction === 'buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('HTX whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

/**
 * MEXC WebSocket'ten whale trade'leri çek
 */
class MEXCWhaleTracker {
  constructor(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
    this.db = dbInstance
    this.minTradeValue = minTradeValue
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.pingInterval = null
  }

  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const wsUrl = 'wss://wbs.mexc.com/ws'
      this.ws = new WebSocket(wsUrl)

      this.ws.on('open', () => {
        this.isConnected = true
        this.reconnectAttempts = 0

        // MEXC ping mekanizmasını önce başlat
        this.startPing()

        // MEXC: Subscribe'ları yavaşça gönder (rate limit'i önlemek için)
        // Her subscribe arasında 200ms gecikme, ilk subscribe 500ms sonra
        setTimeout(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            TRACKED_SYMBOLS.forEach((symbol, index) => {
              setTimeout(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  try {
                    const subscribeMessage = {
                      method: 'sub.deal',
                      param: {
                        symbol: symbol.toLowerCase() // btcusdt
                      }
                    }
                    this.ws.send(JSON.stringify(subscribeMessage))
                  } catch (error) {
                    console.error(`MEXC subscribe hatası (${symbol}):`, error)
                  }
                }
              }, index * 200) // Her subscribe arasında 200ms gecikme
            })
          }
        }, 500) // İlk subscribe 500ms sonra
      })

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(message)
        } catch (error) {
          console.error('MEXC whale message parse hatası:', error)
        }
      })

      this.ws.on('error', (error) => {
        console.error('MEXC whale WebSocket hatası:', error)
      })

      this.ws.on('close', (code, reason) => {
        this.isConnected = false
        this.stopPing()
        const reasonStr = reason ? reason.toString() : 'Bilinmeyen neden'

        // Eğer normal kapanma değilse reconnect dene
        if (code !== 1000) {
          this.attemptReconnect()
        }
      })
    } catch (error) {
      console.error('MEXC whale bağlantı hatası:', error)
      this.attemptReconnect()
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`⚠️ MEXC whale tracking: Maksimum reconnect denemesi aşıldı (${this.maxReconnectAttempts})`)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000) // Max 30 saniye
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  handleMessage(message) {
    // MEXC ping/pong kontrolü
    if (message.ping) {
      const pongMessage = { pong: message.ping }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(pongMessage))
        } catch (error) {
          // Pong gönderme hatası - sessizce atla
        }
      }
      return
    }

    // Subscribe yanıtı kontrolü
    if (message.code === 0 || message.msg === 'success') {
      // Subscribe başarılı
      return
    }

    // Trade mesajları - MEXC format: { c: 'spot@public.deal.v3.api@BTCUSDT', d: { deals: [...] } }
    if (message.c && message.c.includes('deal') && message.d && message.d.deals) {
      // Symbol'ü channel'dan çıkar: spot@public.deal.v3.api@BTCUSDT -> BTCUSDT
      const channelParts = message.c.split('@')
      const symbol = channelParts[channelParts.length - 1]?.toUpperCase() || message.s?.toUpperCase() || message.d.symbol?.toUpperCase()
      const trades = Array.isArray(message.d.deals) ? message.d.deals : [message.d.deals]

      if (symbol) {
        trades.forEach(trade => {
          this.processTrade(symbol, trade)
        })
      }
    }
  }

  startPing() {
    this.stopPing()
    // MEXC: Her 5 saniyede bir ping gönder (çok sık - Code 1005'i önlemek için)
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const pingMessage = { ping: Date.now() }
          this.ws.send(JSON.stringify(pingMessage))
        } catch (error) {
          // Ping gönderme hatası - sessizce atla
        }
      }
    }, 5000) // 5 saniye - MEXC bağlantıyı canlı tutmak için
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  async processTrade(symbol, trade) {
    const price = parseFloat(trade.p || trade.price || 0)
    const size = parseFloat(trade.v || trade.vol || trade.quantity || 0)
    const tradeValue = price * size

    if (tradeValue >= this.minTradeValue) {
      const whaleTrade = {
        id: trade.t || trade.id || `${symbol}_${trade.T || Date.now()}`,
        symbol,
        price,
        quantity: size,
        tradeValue,
        timestamp: new Date(parseInt(trade.T || trade.t || Date.now())),
        isBuyerMaker: trade.S === 'Sell',
        tradeId: trade.t || trade.id,
        source: 'mexc_realtime',
        type: trade.S === 'Buy' ? 'buy' : 'sell'
      }

      await this.saveTrade(whaleTrade)
    }
  }

  async saveTrade(trade) {
    if (!this.db) return

    try {
      const collection = this.db.collection('api_cache')
      const cacheDoc = await collection.findOne({ _id: 'whale_transactions' })
      const existingTrades = cacheDoc?.data?.trades || []

      const existingKeys = new Set(
        existingTrades.map(t => `${t.id}_${t.source || 'unknown'}`)
      )
      const key = `${trade.id}_${trade.source}`

      if (existingKeys.has(key)) {
        return
      }

      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
      const recentTrades = existingTrades.filter(t => {
        const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
        return tradeTime >= twentyFourHoursAgo
      })

      const serializedTrade = {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }

      const allTrades = [serializedTrade, ...recentTrades].slice(0, 500)

      await collection.updateOne(
        { _id: 'whale_transactions' },
        {
          $set: {
            data: {
              trades: allTrades,
              lastUpdate: Date.now()
            },
            lastUpdate: Date.now(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      )

      broadcastWhaleTrade(serializedTrade)
    } catch (error) {
      console.error('MEXC whale trade kaydetme hatası:', error)
    }
  }

  disconnect() {
    this.stopPing()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

// Tracker instance'ları
let binanceTracker = null
let bybitTracker = null
let kucoinTracker = null
let okxTracker = null
let bitgetTracker = null
let gateioTracker = null
let htxTracker = null
let mexcTracker = null

// WebSocket server instance (broadcast için)
let wssInstance = null

/**
 * WebSocket server instance'ını set et
 */
export function setWebSocketServer(wss) {
  wssInstance = wss
}

/**
 * Yeni whale trade'i tüm WebSocket client'larına broadcast et
 */
function broadcastWhaleTrade(trade) {
  if (!wssInstance) return

  try {
    const message = JSON.stringify({
      type: 'whale_trade',
      trade: {
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }
    })

    wssInstance.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message)
        } catch (error) {
          // Sessizce atla - client bağlantısı kopmuş olabilir
        }
      }
    })
  } catch (error) {
    // Broadcast hatası - sessizce atla
  }
}

/**
 * Exchange whale tracking'i başlat
 */
export function startExchangeWhaleTracking(dbInstance, minTradeValue = MIN_TRADE_VALUE) {
  if (!dbInstance) {
    console.error('❌ Exchange whale tracking: MongoDB bağlantısı yok')
    return
  }

  console.log('🚀 Exchange whale tracking başlatılıyor (Binance, Bybit, KuCoin, OKX, Bitget, Gate.io, HTX, MEXC)...')

  // Binance tracker
  if (!binanceTracker) {
    binanceTracker = new BinanceWhaleTracker(dbInstance, minTradeValue)
    binanceTracker.connect()
  }

  // Bybit tracker
  if (!bybitTracker) {
    bybitTracker = new BybitWhaleTracker(dbInstance, minTradeValue)
    bybitTracker.connect()
  }

  // KuCoin tracker
  if (!kucoinTracker) {
    kucoinTracker = new KuCoinWhaleTracker(dbInstance, minTradeValue)
    kucoinTracker.connect()
  }

  // OKX tracker
  if (!okxTracker) {
    okxTracker = new OKXWhaleTracker(dbInstance, minTradeValue)
    okxTracker.connect()
  }

  // Bitget tracker
  if (!bitgetTracker) {
    bitgetTracker = new BitgetWhaleTracker(dbInstance, minTradeValue)
    bitgetTracker.connect()
  }

  // Gate.io tracker
  if (!gateioTracker) {
    gateioTracker = new GateIOWhaleTracker(dbInstance, minTradeValue)
    gateioTracker.connect()
  }

  // HTX tracker
  if (!htxTracker) {
    htxTracker = new HTXWhaleTracker(dbInstance, minTradeValue)
    htxTracker.connect()
  }

  // MEXC tracker
  if (!mexcTracker) {
    mexcTracker = new MEXCWhaleTracker(dbInstance, minTradeValue)
    mexcTracker.connect()
  }
}

/**
 * Exchange whale tracking'i durdur
 */
export function stopExchangeWhaleTracking() {
  console.log('🛑 Exchange whale tracking durduruluyor...')

  if (binanceTracker) {
    binanceTracker.disconnect()
    binanceTracker = null
  }

  if (bybitTracker) {
    bybitTracker.disconnect()
    bybitTracker = null
  }

  if (kucoinTracker) {
    kucoinTracker.disconnect()
    kucoinTracker = null
  }

  if (okxTracker) {
    okxTracker.disconnect()
    okxTracker = null
  }

  if (bitgetTracker) {
    bitgetTracker.disconnect()
    bitgetTracker = null
  }

  if (gateioTracker) {
    gateioTracker.disconnect()
    gateioTracker = null
  }

  if (htxTracker) {
    htxTracker.disconnect()
    htxTracker = null
  }

  if (mexcTracker) {
    mexcTracker.disconnect()
    mexcTracker = null
  }
}

