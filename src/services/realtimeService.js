/**
 * Realtime Service
 * WebSocket üzerinden MongoDB Change Streams'i dinler
 */
class RealtimeService {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.isConnecting = false // Bağlanma sürecinde mi?
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
    // Zaten bağlıysa veya bağlanma sürecindeyse, tekrar bağlanma
    if (this.isConnecting) {
      return // Zaten bağlanma sürecinde
    }
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        return // Zaten bağlı
      }
      if (this.ws.readyState === WebSocket.CONNECTING) {
        this.isConnecting = true
        return // Zaten bağlanıyor
      }
      // Kapanmış veya hata durumunda, mevcut bağlantıyı temizle
      try {
        this.ws.close()
      } catch (e) {
        // Ignore
      }
      this.ws = null
    }
    
    this.isConnecting = true

    // Production'da otomatik tespit
    const getApiUrl = () => {
      if (import.meta.env.VITE_MONGO_API_URL) {
        return import.meta.env.VITE_MONGO_API_URL
      }
      if (import.meta.env.VITE_API_ENDPOINT) {
        return import.meta.env.VITE_API_ENDPOINT
      }
      // Production'da (localhost değilse) window.location.origin kullan
      if (typeof window !== 'undefined') {
        const origin = window.location.origin
        // localhost veya 127.0.0.1 değilse production kabul et
        if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
          return origin
        }
        // localhost:5173 ise backend localhost:3000 kullan
        if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
          return 'http://localhost:3000'
        }
        // Diğer localhost portları için de window.location.origin kullan (development)
        return origin.replace(/:\d+$/, ':3000') // Port'u 3000'e çevir
      }
      return 'http://localhost:3000'
    }
    const mongoApiUrl = getApiUrl()
    const wsUrl = mongoApiUrl.replace(/^http/, 'ws').replace(/^https/, 'wss') + '/ws'
    
    // Sadece ilk bağlantıda log'la
    if (!this.ws) {
      console.log(`🔌 WebSocket bağlantısı: ${wsUrl}`)
    }
    
    try {
      this.ws = new WebSocket(wsUrl)
      
      this.ws.onopen = () => {
        console.log(`✅ WebSocket bağlantısı kuruldu: ${wsUrl}`)
        this.isConnected = true
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.dispatchEvent('connected', { url: wsUrl })
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
        // WebSocket error event'i detaylı bilgi içermez, readyState kontrolü yap
        const state = this.ws?.readyState
        const stateText = state === WebSocket.CONNECTING ? 'CONNECTING' 
          : state === WebSocket.OPEN ? 'OPEN'
          : state === WebSocket.CLOSING ? 'CLOSING'
          : state === WebSocket.CLOSED ? 'CLOSED'
          : 'UNKNOWN'
        
        // Sadece gerçek hataları log'la (CONNECTING durumundaki geçici hatalar normal)
        // CONNECTING durumundaki hataları log'lama (çok fazla log oluşturuyor)
        if (state !== WebSocket.CONNECTING && state !== WebSocket.OPEN) {
          console.error(`❌ WebSocket hatası (${stateText}):`, {
            url: wsUrl,
            readyState: state,
            error: error?.message || error?.type || 'Unknown error',
            timestamp: new Date().toISOString()
          })
        }
        // CONNECTING durumundaki hataları sessizce geç
        this.dispatchEvent('error', { error, url: wsUrl, readyState: state })
      }
      
      this.ws.onclose = (event) => {
        const wasClean = event?.wasClean || false
        const code = event?.code || 0
        const reason = event?.reason || 'Unknown'
        
        // Sadece beklenmeyen kapanmaları log'la
        if (!wasClean && code !== 1000 && code !== 1006) {
          console.log(`📡 WebSocket bağlantısı kapatıldı (code: ${code}, clean: ${wasClean}, reason: ${reason})`)
        }
        this.isConnected = false
        this.isConnecting = false
        this.dispatchEvent('disconnected', { code, reason, wasClean })
        
        // Sadece beklenmeyen kapanmalarda yeniden bağlan (1006 = abnormal closure, normal)
        if (!wasClean && code !== 1000 && code !== 1006) {
          this.attemptReconnect()
        } else if (code === 1006) {
          // Abnormal closure - kısa bir süre sonra yeniden bağlan
          setTimeout(() => {
            if (!this.isConnected) {
              this.attemptReconnect()
            }
          }, 2000)
        }
      }
    } catch (error) {
      console.error('❌ WebSocket bağlantı hatası:', {
        url: wsUrl,
        error: error.message,
        stack: error.stack
      })
      this.isConnecting = false
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
      // Maksimum deneme aşıldı, sessizce dur
      return
    }
    
    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000) // Max 10 saniye
    
    // Sadece ilk birkaç denemede log'la
    if (this.reconnectAttempts <= 3) {
      console.log(`🔄 ${delay / 1000} saniye sonra yeniden bağlanma denemesi (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
    }
    
    setTimeout(() => {
      if (!this.isConnected && !this.ws) {
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

