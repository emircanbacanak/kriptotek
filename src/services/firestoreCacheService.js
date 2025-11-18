/**
 * Firestore Cache Service
 * Firebase Firestore'u cache olarak kullanır (fallback)
 */
class FirestoreCacheService {
  constructor() {
    this.cache = new Map()
  }

  /**
   * Cache'e veri kaydet
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * Cache'den veri al
   */
  getCache(key) {
    const cached = this.cache.get(key)
    if (!cached) return null
    
    // 5 dakika TTL
    const age = Date.now() - cached.timestamp
    if (age > 300000) {
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
}

const firestoreCacheService = new FirestoreCacheService()
export default firestoreCacheService

