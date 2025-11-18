// Merkezi Dominance Veri Yönetim Sistemi
// Tüm sayfalar için dominance veri çekme ve güncelleme işlemlerini yönetir

import dominanceService from '../services/dominanceService'
import fearGreedService from '../services/fearGreedService'

class DominanceDataManager {
  constructor() {
    this.dominanceData = null
    this.fearGreedIndex = null
    this.lastUpdate = null
    this.updateTimeout = null
    this.subscribers = new Set()
    this.isUpdating = false
    this.updateIntervalMs = 5 * 60 * 1000 // 5 dakika
  }

  // Abone ol (sayfalar veri değişikliklerini dinleyebilir)
  subscribe(callback) {
    this.subscribers.add(callback)
    // Mevcut veriyi hemen gönder
    callback({
      dominanceData: this.dominanceData,
      fearGreedIndex: this.fearGreedIndex,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    })
    
    // Cleanup fonksiyonu
    return () => {
      this.subscribers.delete(callback)
    }
  }

  // Tüm abonelere bildir
  notifySubscribers() {
    const data = {
      dominanceData: this.dominanceData,
      fearGreedIndex: this.fearGreedIndex,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    }
    
    this.subscribers.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('Error notifying dominance subscriber:', error)
      }
    })
  }

  // MongoDB'den veri çek
  async loadFromMongoDB() {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const response = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)
      
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          return result.data
        }
      } else if (response.status === 404) {
        // Veri yok, bu normal
        return null
      }
    } catch (error) {
      // Sessiz devam et
    }
    return null
  }

  // MongoDB'ye veri kaydet
  async saveToMongoDB(data) {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const response = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          return true
        }
      }
    } catch (error) {
      // Sessiz devam et
    }
    return false
  }

  // Veri güncelle
  async updateData() {
    if (this.isUpdating) {
      return
    }

    const updateStartTime = Date.now()
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    const nextUpdateTime = new Date(Date.now() + this.getNextUpdateTime()).toLocaleTimeString('tr-TR')
    
    this.isUpdating = true
    this.notifySubscribers()

    console.log(`\n📊 [${timeStr}] ========== Veri Güncelleme Başladı ==========`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

    const results = {
      dominance: { success: false, duration: 0, source: null, apiStatuses: [] },
      fearGreed: { success: false, duration: 0, source: null, apiStatuses: [] }
    }

    try {
      // ========== DOMINANCE VERİSİ ==========
      const dominanceStartTime = Date.now()
      
      try {
        // Önce MongoDB'den veri çek (eğer varsa)
        let dominanceResult = await this.loadFromMongoDB()
        let dominanceApiStatuses = []
        
        // Eğer MongoDB'de veri yoksa veya eski ise, API'den çek
        if (!dominanceResult || !dominanceResult.global || !dominanceResult.dominanceData) {
          const apiResult = await dominanceService.fetchDominanceData(0, true)
          dominanceResult = apiResult.data || apiResult
          dominanceApiStatuses = apiResult.apiStatuses || []
          
          // API'den veri çekildiyse MongoDB'ye kaydet
          if (dominanceResult && dominanceResult.global && dominanceResult.dominanceData) {
            await this.saveToMongoDB(dominanceResult)
            results.dominance.source = 'API → MongoDB'
          }
        } else {
          results.dominance.source = 'MongoDB'
          dominanceApiStatuses = [{ name: 'MongoDB Dominance', success: true }]
          // MongoDB'den gelen veri historicalData içeriyor mu kontrol et
          if (dominanceResult.historicalData && dominanceResult.historicalData.length > 0) {
            // Sadece bugünün verisini güncelle (mevcut historicalData'yı koru)
            await dominanceService.updateHistoricalData(dominanceResult)
            // Güncellenmiş veriyi MongoDB'ye kaydet
            await this.saveToMongoDB(dominanceResult)
          } else {
            await dominanceService.updateHistoricalData(dominanceResult)
            // Güncellenmiş veriyi MongoDB'ye kaydet
            await this.saveToMongoDB(dominanceResult)
          }
        }
        
        if (dominanceResult && dominanceResult.global && dominanceResult.dominanceData) {
          this.dominanceData = dominanceResult
          this.lastUpdate = Date.now()
          results.dominance.success = true
          results.dominance.duration = ((Date.now() - dominanceStartTime) / 1000).toFixed(2)
          results.dominance.apiStatuses = dominanceApiStatuses
        } else {
          results.dominance.duration = ((Date.now() - dominanceStartTime) / 1000).toFixed(2)
          results.dominance.apiStatuses = dominanceApiStatuses
        }
      } catch (dominanceError) {
        results.dominance.duration = ((Date.now() - dominanceStartTime) / 1000).toFixed(2)
        console.error(`❌ [${timeStr}] Dominance verisi hatası (${results.dominance.duration}s):`, dominanceError.message || dominanceError)
        if (dominanceError.apiStatuses) {
          results.dominance.apiStatuses = dominanceError.apiStatuses
        }
      }

      // ========== FEAR & GREED VERİSİ ==========
      const fearGreedStartTime = Date.now()
      
      try {
        const fearGreedResult = await fearGreedService.fetchFearGreedData()
        const fearGreedData = fearGreedResult.data
        const fearGreedApiStatuses = fearGreedResult.apiStatuses || []
        results.fearGreed.duration = ((Date.now() - fearGreedStartTime) / 1000).toFixed(2)
        results.fearGreed.apiStatuses = fearGreedApiStatuses
        
        // Sadece gerçek veri varsa kaydet - timestamp kontrolü yap
        if (fearGreedData && 
            fearGreedData.value !== undefined && 
            fearGreedData.value !== null && 
            !isNaN(fearGreedData.value) &&
            fearGreedData.timestamp && 
            fearGreedData.timestamp > 0) {
          // Gerçek veri - kaydet
          this.fearGreedIndex = fearGreedData
          results.fearGreed.success = true
        } else {
          // Veri yok veya geçersiz - null bırak
          this.fearGreedIndex = null
          results.fearGreed.success = false
        }
      } catch (fearGreedError) {
        results.fearGreed.duration = ((Date.now() - fearGreedStartTime) / 1000).toFixed(2)
        console.error(`❌ [${timeStr}] Fear & Greed Index verisi hatası (${results.fearGreed.duration}s):`, fearGreedError.message || fearGreedError)
        if (fearGreedError.apiStatuses) {
          results.fearGreed.apiStatuses = fearGreedError.apiStatuses
        }
      }

      // ========== ÖZET ==========
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.log(`\n📊 [${timeStr}] ========== Veri Güncelleme Tamamlandı ==========`)
      console.log(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      console.log(`📈 [${timeStr}] Dominance: ${results.dominance.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.dominance.duration}s) - ${results.dominance.source || 'N/A'}`)
      
      // Dominance API durumlarını göster
      if (results.dominance.apiStatuses && results.dominance.apiStatuses.length > 0) {
        results.dominance.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`😱 [${timeStr}] Fear & Greed: ${results.fearGreed.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.fearGreed.duration}s)`)
      
      // Fear & Greed API durumlarını göster
      if (results.fearGreed.apiStatuses && results.fearGreed.apiStatuses.length > 0) {
        results.fearGreed.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
      console.log(`═══════════════════════════════════════════════════════════\n`)

    } catch (error) {
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.error(`\n❌ [${timeStr}] ========== Veri Güncelleme Hatası ==========`)
      console.error(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      console.error(`❌ [${timeStr}] Hata:`, error.message || error)
      
      // Hata durumunda API durumlarını göster
      if (results.dominance.apiStatuses && results.dominance.apiStatuses.length > 0) {
        console.error(`📈 [${timeStr}] Dominance API Durumları:`)
        results.dominance.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.error(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      if (results.fearGreed.apiStatuses && results.fearGreed.apiStatuses.length > 0) {
        console.error(`😱 [${timeStr}] Fear & Greed API Durumları:`)
        results.fearGreed.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.error(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.error(`═══════════════════════════════════════════════════════════\n`)
      
      // Hata durumunda MongoDB'den cache'den veri kullanılabilir
      try {
        const cachedData = await this.loadFromMongoDB()
        if (cachedData && cachedData.global && cachedData.dominanceData) {
          this.dominanceData = cachedData
        }
      } catch (cacheError) {
        // Sessiz devam et
      }
    } finally {
      this.isUpdating = false
      this.notifySubscribers()
    }
  }

  // Bir sonraki güncelleme zamanını hesapla (5 dakikalık sabit aralıklar: 00:05, 00:10, 00:15, ...)
  getNextUpdateTime() {
    const now = new Date()
    const currentMinutes = now.getMinutes()
    
    // Şu anki dakikanın hangi 5 dakikalık dilimde olduğunu bul
    const currentSlot = Math.floor(currentMinutes / 5)
    const nextSlot = currentSlot + 1
    
    // Bir sonraki 5 dakikalık zaman dilimini oluştur
    const nextUpdate = new Date(now)
    
    if (nextSlot * 5 >= 60) {
      // Bir sonraki saate geç (00:00, 00:05, 00:10, ...)
      nextUpdate.setHours(now.getHours() + 1)
      nextUpdate.setMinutes(0)
    } else {
      // Aynı saat içinde, sonraki 5 dakikalık dilime geç
      nextUpdate.setMinutes(nextSlot * 5)
    }
    
    nextUpdate.setSeconds(0)
    nextUpdate.setMilliseconds(0)
    
    // Şu anki zamandan sonraki zamana kadar geçen süreyi hesapla
    let delay = nextUpdate.getTime() - now.getTime()
    
    // Eğer delay çok küçükse (1 saniyeden az), bir sonraki 5 dakikaya geç
    if (delay < 1000) {
      nextUpdate.setMinutes(nextUpdate.getMinutes() + 5)
      delay = nextUpdate.getTime() - now.getTime()
    }
    
    return delay
  }

  // Otomatik güncelleme başlat
  startAutoUpdate() {
    // Eğer zaten çalışıyorsa, tekrar başlatma
    if (this.updateTimeout !== null) {
      return
    }
    
    // İlk güncellemeyi hemen yap (eğer veri yoksa)
    if (!this.dominanceData) {
      this.updateData().catch(() => {})
    }
    
    // Recursive setTimeout kullanarak 5 dakikalık sabit zaman dilimlerinde güncelle
    const scheduleNextUpdate = () => {
      const delay = this.getNextUpdateTime()
      
      this.updateTimeout = setTimeout(() => {
        this.updateData().catch(() => {})
        // Her güncellemeden sonra bir sonraki zamanı planla
        scheduleNextUpdate()
      }, delay)
    }
    
    scheduleNextUpdate()
  }

  // Otomatik güncellemeyi durdur
  stopAutoUpdate() {
    if (this.updateTimeout !== null) {
      clearTimeout(this.updateTimeout)
      this.updateTimeout = null
    }
  }

  // Manuel yenileme
  async refresh() {
    await this.updateData()
  }

  // Mevcut veriyi al
  getData() {
    return {
      dominanceData: this.dominanceData,
      fearGreedIndex: this.fearGreedIndex,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    }
  }
}

// Singleton instance
const dominanceDataManager = new DominanceDataManager()

export default dominanceDataManager

