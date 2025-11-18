// Merkezi Global Veri Yönetim Sistemi
// TÜM veri çekme işlemleri buradan yönetilir
// 5 dakikada bir tüm veriler güncellenir (00:00, 00:05, 00:10, ...)
// Sayfa açık olmasa bile veriler güncellenir

import cryptoService from '../services/cryptoService'
import dominanceService from '../services/dominanceService'
import fearGreedService from '../services/fearGreedService'
// currencyService artık backend scheduler tarafından yönetiliyor, sadece MongoDB'den okuyoruz

class GlobalDataManager {
  constructor() {
    // Crypto verileri (Home sayfası için)
    this.coins = []
    this.topMovers = { topGainers: [], topLosers: [] }
    this.lastCryptoUpdate = null
    
    // Dominance verileri (Market Overview sayfası için)
    this.dominanceData = null
    this.fearGreedIndex = null
    this.lastDominanceUpdate = null
    
    // Trending verileri (Trending sayfası için)
    this.trendingCoins = []
    this.lastTrendingUpdate = null
    
    // Currency rates (Settings sayfası için)
    this.currencyRates = null
    this.lastCurrencyUpdate = null
    
    // Güncelleme kontrolü
    this.updateTimeout = null
    this.subscribers = new Set()
    this.isUpdating = false
    
    // API URL
    this.MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
  }

  // Abone ol (sayfalar veri değişikliklerini dinleyebilir)
  subscribe(callback) {
    this.subscribers.add(callback)
    // Mevcut veriyi hemen gönder
    callback(this.getData())
    
    // Cleanup fonksiyonu
    return () => {
      this.subscribers.delete(callback)
    }
  }

  // Tüm abonelere bildir
  notifySubscribers() {
    const data = this.getData()
    
    this.subscribers.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('Error notifying global subscriber:', error)
      }
    })
  }

  // Top movers hesapla
  calculateTopMovers(coins) {
    if (!Array.isArray(coins) || coins.length === 0) {
      return { topGainers: [], topLosers: [] }
    }

    const filtered = coins.filter(coin => {
      const change = typeof coin.price_change_percentage_24h === 'number' ? coin.price_change_percentage_24h : null
      if (change === null || Number.isNaN(change)) return false
      if (!coin.total_volume || coin.total_volume < 1000000) return false
      if (!coin.market_cap || coin.market_cap < 50000000) return false
      if (!coin.current_price || coin.current_price <= 0) return false
      return true
    })

    const mapCoin = (coin) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      image: coin.image || `https://assets.coingecko.com/coins/images/${coin.id}/large/${coin.id}.png`,
      current_price: coin.current_price,
      price_change_percentage_24h: coin.price_change_percentage_24h
    })

    const topGainers = filtered
      .filter(coin => coin.price_change_percentage_24h > 0)
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      .slice(0, 3)
      .map(mapCoin)

    const topLosers = filtered
      .filter(coin => coin.price_change_percentage_24h < 0)
      .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
      .slice(0, 3)
      .map(mapCoin)

    return { topGainers, topLosers }
  }

  // TÜM VERİLERİ GÜNCELLE (tek bir yerden)
  async updateAllData() {
    if (this.isUpdating) {
      return
    }

    const updateStartTime = Date.now()
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    const nextUpdateTime = new Date(Date.now() + this.getNextUpdateTime()).toLocaleTimeString('tr-TR')
    
    this.isUpdating = true
    this.notifySubscribers()

    console.log(`\n🌐 [${timeStr}] ========== Global Veri Güncelleme Başladı ==========`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

    const results = {
      crypto: { success: false, duration: 0, apiStatuses: [] },
      dominance: { success: false, duration: 0, apiStatuses: [] },
      fearGreed: { success: false, duration: 0, apiStatuses: [] },
      trending: { success: false, duration: 0, apiStatuses: [] },
      currency: { success: false, duration: 0, apiStatuses: [] }
    }

    try {
      // ========== 1. CRYPTO VERİLERİ (Home sayfası için) ==========
      const cryptoStartTime = Date.now()
      try {
        // ÖNCE MongoDB'den çek (hızlı, cache'den)
        const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
        let cryptoList = []
        let cryptoApiStatuses = []
        let fromMongoDB = false
        
        try {
          const mongoResponse = await fetch(`${MONGO_API_URL}/cache/crypto_list`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000) // 5 saniye timeout (hızlı olmalı)
          })
          
          if (mongoResponse.ok) {
            const mongoResult = await mongoResponse.json()
            if (mongoResult.success && mongoResult.data) {
              // Backend'den gelen veri formatı: { _id: 'crypto_list', coins: [...], ... }
              const coins = mongoResult.data.coins || mongoResult.data.data?.coins || []
              if (Array.isArray(coins) && coins.length > 0) {
                cryptoList = coins
                cryptoApiStatuses.push({ name: 'MongoDB Cache', success: true })
                fromMongoDB = true
                console.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${cryptoList.length} coin)`)
              }
            }
          } else if (mongoResponse.status === 404) {
            cryptoApiStatuses.push({ name: 'MongoDB Cache', success: false, error: 'Not found (404)' })
          }
        } catch (mongoError) {
          cryptoApiStatuses.push({ name: 'MongoDB Cache', success: false, error: mongoError.message })
        }
        
        // MongoDB'den veri yoksa veya boşsa, API'den çek
        if (!fromMongoDB || cryptoList.length === 0) {
          console.log(`⚠️ [${timeStr}] MongoDB'den veri yok, API'den çekiliyor...`)
          const cryptoResult = await cryptoService.fetchCryptoListWithStatus()
          cryptoList = cryptoResult.data || []
          const cryptoApiStatus = cryptoResult.apiStatus || {}
          
          if (cryptoApiStatus.apiStatuses && Array.isArray(cryptoApiStatus.apiStatuses)) {
            cryptoApiStatuses.push(...cryptoApiStatus.apiStatuses)
          } else if (cryptoApiStatus.source) {
            cryptoApiStatuses.push({ name: cryptoApiStatus.source, success: cryptoApiStatus.success || false })
          }
        }
        
        // Veriyi kaydet
        if (cryptoList && cryptoList.length > 0) {
          const limitedList = cryptoList.length > 500 ? cryptoList.slice(0, 500) : cryptoList
          this.coins = limitedList
          this.topMovers = this.calculateTopMovers(limitedList)
          this.lastCryptoUpdate = new Date()
          results.crypto.success = true
        }
        
        results.crypto.apiStatuses = cryptoApiStatuses
        results.crypto.duration = ((Date.now() - cryptoStartTime) / 1000).toFixed(2)
      } catch (error) {
        results.crypto.duration = ((Date.now() - cryptoStartTime) / 1000).toFixed(2)
        if (error.apiStatus) {
          results.crypto.apiStatuses = error.apiStatus.apiStatuses || []
        }
        console.error(`❌ [${timeStr}] Crypto verisi hatası:`, error.message || error)
      }

      // ========== 2. DOMINANCE VERİLERİ (Market Overview sayfası için) ==========
      const dominanceStartTime = Date.now()
      try {
        // Önce MongoDB'den veri çek
        const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
        let dominanceResult = null
        let dominanceApiStatuses = []
        
        try {
          const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)
          if (mongoResponse.ok) {
            const mongoResult = await mongoResponse.json()
            if (mongoResult.success && mongoResult.data) {
              dominanceResult = mongoResult.data
              dominanceApiStatuses.push({ name: 'MongoDB Dominance', success: true })
            }
          } else if (mongoResponse.status === 404) {
            dominanceApiStatuses.push({ name: 'MongoDB Dominance', success: false, error: 'Not found (404)' })
          }
        } catch (mongoError) {
          dominanceApiStatuses.push({ name: 'MongoDB Dominance', success: false, error: mongoError.message })
        }
        
        // MongoDB'den veri yoksa, backend API'den güncelleme isteği gönder (scheduler zaten güncelliyor ama yoksa manuel güncelle)
        if (!dominanceResult || !dominanceResult.global || !dominanceResult.dominanceData) {
          // Backend scheduler zaten güncelliyor, sadece bekle
          dominanceApiStatuses.push({ name: 'Backend Scheduler', success: true, message: 'Veri backend scheduler tarafından güncellenecek' })
        }
        
        // MongoDB'den gelen veriyi kullan
        if (dominanceResult && dominanceResult.global && dominanceResult.dominanceData) {
          this.dominanceData = dominanceResult
          this.lastDominanceUpdate = Date.now()
          results.dominance.success = true
        }
        results.dominance.duration = ((Date.now() - dominanceStartTime) / 1000).toFixed(2)
        results.dominance.apiStatuses = dominanceApiStatuses
      } catch (error) {
        results.dominance.duration = ((Date.now() - dominanceStartTime) / 1000).toFixed(2)
        if (error.apiStatuses) {
          results.dominance.apiStatuses = error.apiStatuses
        }
        console.error(`❌ [${timeStr}] Dominance verisi hatası:`, error.message || error)
      }

      // ========== 3. FEAR & GREED VERİSİ ==========
      const fearGreedStartTime = Date.now()
      try {
        const fearGreedResult = await fearGreedService.fetchFearGreedData()
        const fearGreedData = fearGreedResult.data || fearGreedResult
        const fearGreedApiStatuses = fearGreedResult.apiStatuses || []
        
        if (fearGreedData && fearGreedData.value !== undefined && fearGreedData.value !== null) {
          this.fearGreedIndex = fearGreedData
          results.fearGreed.success = true
        }
        results.fearGreed.duration = ((Date.now() - fearGreedStartTime) / 1000).toFixed(2)
        results.fearGreed.apiStatuses = fearGreedApiStatuses
      } catch (error) {
        results.fearGreed.duration = ((Date.now() - fearGreedStartTime) / 1000).toFixed(2)
        if (error.apiStatuses) {
          results.fearGreed.apiStatuses = error.apiStatuses
        }
        console.error(`❌ [${timeStr}] Fear & Greed verisi hatası:`, error.message || error)
      }

      // ========== 4. TRENDING VERİLERİ (Trending sayfası için) ==========
      // Anasayfadaki 500 coin'i kullanarak trending hesapla
      const trendingStartTime = Date.now()
      try {
        // Önce anasayfadaki coin listesini backend'e gönder ve trending hesapla
        if (this.coins && this.coins.length > 0) {
          try {
            const updateResponse = await fetch(`${this.MONGO_API_URL}/api/trending/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ coins: this.coins })
            })
            
            if (updateResponse.ok) {
              const updateResult = await updateResponse.json()
              if (updateResult.success && updateResult.data) {
                this.trendingCoins = updateResult.data.coins || []
                this.lastTrendingUpdate = updateResult.data.updatedAt || Date.now()
                results.trending.success = true
                results.trending.apiStatuses = [{ name: 'Trending Update (Homepage Coins)', success: true }]
                results.trending.duration = ((Date.now() - trendingStartTime) / 1000).toFixed(2)
              } else {
                // Update başarısız, MongoDB'den çek
                throw new Error('Trending update failed, fetching from MongoDB')
              }
            } else {
              // Update başarısız, MongoDB'den çek
              throw new Error('Trending update failed, fetching from MongoDB')
            }
          } catch (updateError) {
            // Update başarısız, MongoDB'den mevcut veriyi çek
            const trendingResponse = await fetch(`${this.MONGO_API_URL}/api/trending`)
            if (trendingResponse.ok) {
              const trendingResult = await trendingResponse.json()
              if (trendingResult.success && trendingResult.data) {
                this.trendingCoins = trendingResult.data.coins || []
                this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
                results.trending.success = true
                results.trending.apiStatuses = [{ name: 'MongoDB Trending (Fallback)', success: true }]
              } else {
                results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: false, error: 'No data' }]
              }
            } else {
              results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: false, error: `HTTP ${trendingResponse.status}` }]
            }
            results.trending.duration = ((Date.now() - trendingStartTime) / 1000).toFixed(2)
          }
        } else {
          // Anasayfada coin yok, MongoDB'den çek
          const trendingResponse = await fetch(`${this.MONGO_API_URL}/api/trending`)
          if (trendingResponse.ok) {
            const trendingResult = await trendingResponse.json()
            if (trendingResult.success && trendingResult.data) {
              this.trendingCoins = trendingResult.data.coins || []
              this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
              results.trending.success = true
              results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: true }]
            } else {
              results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: false, error: 'No data' }]
            }
          } else {
            results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: false, error: `HTTP ${trendingResponse.status}` }]
          }
          results.trending.duration = ((Date.now() - trendingStartTime) / 1000).toFixed(2)
        }
      } catch (error) {
        results.trending.duration = ((Date.now() - trendingStartTime) / 1000).toFixed(2)
        results.trending.apiStatuses = [{ name: 'Trending Error', success: false, error: error.message }]
        console.error(`❌ [${timeStr}] Trending verisi hatası:`, error.message || error)
      }

      // ========== 5. CURRENCY RATES (Settings sayfası için) ==========
      // Currency Rates artık backend scheduler tarafından yönetiliyor
      const currencyStartTime = Date.now()
      try {
        // MongoDB'den currency rates çek
        const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
        let currencyResult = null
        let currencyApiStatuses = []
        
        try {
          const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/currency_rates`)
          if (mongoResponse.ok) {
            const mongoResult = await mongoResponse.json()
            if (mongoResult.success && mongoResult.data) {
              currencyResult = mongoResult.data
              currencyApiStatuses.push({ name: 'MongoDB Currency Rates', success: true })
            }
          } else if (mongoResponse.status === 404) {
            currencyApiStatuses.push({ name: 'MongoDB Currency Rates', success: false, error: 'Not found (404)' })
          }
        } catch (mongoError) {
          currencyApiStatuses.push({ name: 'MongoDB Currency Rates', success: false, error: mongoError.message })
        }
        
        // MongoDB'den veri yoksa, backend scheduler zaten güncelliyor
        if (!currencyResult || Object.keys(currencyResult).length === 0) {
          currencyApiStatuses.push({ name: 'Backend Scheduler', success: true, message: 'Veri backend scheduler tarafından güncellenecek' })
        }
        
        // MongoDB'den gelen veriyi kullan
        if (currencyResult && Object.keys(currencyResult).length > 0) {
          this.currencyRates = currencyResult
          this.lastCurrencyUpdate = Date.now()
          
          // window.__exchangeRates'i güncelle (currencyConverter için)
          if (typeof window !== 'undefined') {
            window.__exchangeRates = currencyResult
            // Event dispatch et (Settings sayfası için)
            window.dispatchEvent(new CustomEvent('exchangeRatesUpdated', { detail: currencyResult }))
            window.dispatchEvent(new CustomEvent('globalUpdateCompleted', { detail: { currencyRates: currencyResult } }))
          }
          results.currency.success = true
        }
        
        results.currency.duration = ((Date.now() - currencyStartTime) / 1000).toFixed(2)
        results.currency.apiStatuses = currencyApiStatuses
      } catch (error) {
        results.currency.duration = ((Date.now() - currencyStartTime) / 1000).toFixed(2)
        if (error.apiStatuses) {
          results.currency.apiStatuses = error.apiStatuses
        }
        console.error(`❌ [${timeStr}] Currency rates hatası:`, error.message || error)
      }

      // ========== ÖZET ==========
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.log(`\n🌐 [${timeStr}] ========== Global Veri Güncelleme Tamamlandı ==========`)
      console.log(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      
      console.log(`📈 [${timeStr}] Crypto: ${results.crypto.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.crypto.duration}s)`)
      if (results.crypto.apiStatuses && results.crypto.apiStatuses.length > 0) {
        results.crypto.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`📊 [${timeStr}] Dominance: ${results.dominance.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.dominance.duration}s)`)
      if (results.dominance.apiStatuses && results.dominance.apiStatuses.length > 0) {
        results.dominance.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`😱 [${timeStr}] Fear & Greed: ${results.fearGreed.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.fearGreed.duration}s)`)
      if (results.fearGreed.apiStatuses && results.fearGreed.apiStatuses.length > 0) {
        results.fearGreed.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`📈 [${timeStr}] Trending: ${results.trending.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.trending.duration}s)`)
      if (results.trending.apiStatuses && results.trending.apiStatuses.length > 0) {
        results.trending.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`💱 [${timeStr}] Currency: ${results.currency.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.currency.duration}s)`)
      if (results.currency.apiStatuses && results.currency.apiStatuses.length > 0) {
        results.currency.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
      console.log(`═══════════════════════════════════════════════════════════\n`)

    } catch (error) {
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.error(`\n❌ [${timeStr}] ========== Global Veri Güncelleme Hatası ==========`)
      console.error(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      console.error(`❌ [${timeStr}] Hata:`, error.message || error)
      console.error(`═══════════════════════════════════════════════════════════\n`)
    } finally {
      this.isUpdating = false
      this.notifySubscribers()
    }
  }

  // Sonraki güncelleme zamanını hesapla (5 dakikalık sabit aralıklar: 00:05, 00:10, 00:15, ...)
  getNextUpdateTime() {
    const now = new Date()
    const currentMinutes = now.getMinutes()
    
    const currentSlot = Math.floor(currentMinutes / 5)
    const nextSlot = currentSlot + 1
    
    const nextUpdate = new Date(now)
    
    if (nextSlot * 5 >= 60) {
      nextUpdate.setHours(now.getHours() + 1)
      nextUpdate.setMinutes(0)
    } else {
      nextUpdate.setMinutes(nextSlot * 5)
    }
    
    nextUpdate.setSeconds(0)
    nextUpdate.setMilliseconds(0)
    
    let delay = nextUpdate.getTime() - now.getTime()
    
    if (delay < 1000) {
      nextUpdate.setMinutes(nextUpdate.getMinutes() + 5)
      delay = nextUpdate.getTime() - now.getTime()
    }
    
    return delay
  }

  // Otomatik güncelleme başlat
  startAutoUpdate() {
    if (this.updateTimeout !== null) {
      return
    }
    
    // İlk güncellemeyi hemen yap
    this.updateAllData().catch(() => {})
    
    // Recursive setTimeout kullanarak 5 dakikalık sabit zaman dilimlerinde güncelle
    const scheduleNextUpdate = () => {
      const delay = this.getNextUpdateTime()
      
      this.updateTimeout = setTimeout(() => {
        this.updateAllData().catch(() => {})
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
    await this.updateAllData()
  }

  // Mevcut veriyi al
  getData() {
    return {
      // Crypto verileri
      coins: this.coins,
      topMovers: this.topMovers,
      lastCryptoUpdate: this.lastCryptoUpdate,
      
      // Dominance verileri
      dominanceData: this.dominanceData,
      fearGreedIndex: this.fearGreedIndex,
      lastDominanceUpdate: this.lastDominanceUpdate,
      
      // Trending verileri
      trendingCoins: this.trendingCoins,
      lastTrendingUpdate: this.lastTrendingUpdate,
      
      // Currency rates
      currencyRates: this.currencyRates,
      lastCurrencyUpdate: this.lastCurrencyUpdate,
      
      // Genel durum
      isUpdating: this.isUpdating
    }
  }
}

// Singleton instance
const globalDataManager = new GlobalDataManager()

export default globalDataManager
