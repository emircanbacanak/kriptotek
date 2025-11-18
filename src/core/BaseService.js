/**
 * Base Service Class
 * Tüm servisler için temel sınıf (OOP prensipleri)
 */
class BaseService {
  constructor(serviceName) {
    this.serviceName = serviceName
    this.cache = new Map() // Memory cache
    this.updateInterval = null
    this.isRunning = false
  }

  /**
   * Cache'e veri kaydet
   */
  setCache(key, data, ttl = 300000) { // Default 5 dakika
    const expiry = Date.now() + ttl
    this.cache.set(key, { data, expiry })
  }

  /**
   * Cache'den veri al
   */
  getCache(key) {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key)
      return null
    }
    
    return cached.data
  }

  /**
   * Cache'i temizle
   */
  clearCache(key) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  /**
   * Servisi başlat
   */
  async start() {
    if (this.isRunning) return
    this.isRunning = true
    console.log(`✅ ${this.serviceName} servisi başlatıldı`)
  }

  /**
   * Servisi durdur
   */
  async stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    this.isRunning = false
    console.log(`🛑 ${this.serviceName} servisi durduruldu`)
  }

  /**
   * Merkezi güncelleme metodu (override edilmeli)
   */
  async update() {
    throw new Error('update() method must be implemented')
  }
}

export default BaseService

