/**
 * Realtime Service
 * WebSocket üzerinden MongoDB Change Streams'i dinler
 */
class RealtimeService {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 3000
    this.subscriptions = new Map() // Map<collection, Set<callback>>
    this.eventListeners = new Map() // Map<eventType, Set<callback>>
  }

  /**
   * WebSocket bağlantısını başlat
   */
  connect() {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return // Zaten bağlı
    }

    const mongoApiUrl = import.meta.env.VITE_MONGO_API_URL || 'http://localhost:4000'
    const wsUrl = mongoApiUrl.replace(/^http/, 'ws') + '/ws'
    
    try {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket bağlantısı kuruldu')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.dispatchEvent('connected', {})
      }
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          this.handleMessage(message)
        } catch (error) {
          console.error('❌ WebSocket mesaj parse hatası:', error)
        }
      }
      
      this.ws.onerror = (error) => {
        console.error('❌ WebSocket hatası:', error)
        this.dispatchEvent('error', { error })
      }
      
      this.ws.onclose = () => {
        console.log('📡 WebSocket bağlantısı kapatıldı')
        this.isConnected = false
        this.dispatchEvent('disconnected', {})
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('❌ WebSocket bağlantı hatası:', error)
      this.attemptReconnect()
    }
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
    this.reconnectAttempts = this.maxReconnectAttempts // Yeniden bağlanmayı durdur
  }

  /**
   * Yeniden bağlanmayı dene
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('⚠️ Maksimum yeniden bağlanma denemesi aşıldı')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts
    
    console.log(`🔄 ${delay / 1000} saniye sonra yeniden bağlanma denemesi (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect()
      }
    }, delay)
  }

  /**
   * WebSocket mesajını işle
   */
  handleMessage(message) {
    if (message.type === 'change') {
      const { collection, operationType, documentId, fullDocument } = message
      
      // Collection bazlı subscription'ları çağır
      const callbacks = this.subscriptions.get(collection)
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback({
              operationType,
              documentId,
              data: fullDocument,
              fullDocument
            })
          } catch (error) {
            console.error('❌ Subscription callback hatası:', error)
          }
        })
      }
      
      // Global event dispatch
      window.dispatchEvent(new CustomEvent(`mongodb:${collection}:${operationType}`, {
        detail: {
          collection,
          operationType,
          documentId,
          data: fullDocument
        }
      }))
    }
  }

  /**
   * Collection değişikliklerini dinle
   */
  subscribe(collection, callback) {
    if (!this.subscriptions.has(collection)) {
      this.subscriptions.set(collection, new Set())
    }
    
    this.subscriptions.get(collection).add(callback)
    
    // Bağlı değilse bağlan
    if (!this.isConnected) {
      this.connect()
    }
    
    // Unsubscribe fonksiyonu döndür
    return () => {
      const callbacks = this.subscriptions.get(collection)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.subscriptions.delete(collection)
        }
      }
    }
  }

  /**
   * Event dinle
   */
  on(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set())
    }
    
    this.eventListeners.get(eventType).add(callback)
    
    // Unsubscribe fonksiyonu döndür
    return () => {
      const listeners = this.eventListeners.get(eventType)
      if (listeners) {
        listeners.delete(callback)
        if (listeners.size === 0) {
          this.eventListeners.delete(eventType)
        }
      }
    }
  }

  /**
   * Event dispatch et
   */
  dispatchEvent(eventType, data) {
    const listeners = this.eventListeners.get(eventType)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('❌ Event listener hatası:', error)
        }
      })
    }
  }
}

// Singleton instance
const realtimeService = new RealtimeService()

export default realtimeService

