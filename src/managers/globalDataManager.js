// Merkezi Global Veri Yönetim Sistemi
// TÜM veri çekme işlemleri buradan yönetilir
// 5 dakikada bir tüm veriler güncellenir (00:00, 00:05, 00:10, ...)
// Sayfa açık olmasa bile veriler güncellenir

import cryptoService from '../services/cryptoService'
import dominanceService from '../services/dominanceService'
import fearGreedService from '../services/fearGreedService'
import realtimeService from '../services/realtimeService'
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
    
    // Fed Rate verileri (FedRate sayfası için)
    this.fedRateData = null
    this.lastFedRateUpdate = null
    
    // Supply Tracking verileri (SupplyTracking sayfası için)
    this.supplyTrackingData = null
    this.lastSupplyTrackingUpdate = null
    
    // Güncelleme kontrolü
    this.updateTimeout = null
    this.subscribers = new Set()
    this.isUpdating = false
    
    // API URL - Production'da otomatik tespit
    const getApiUrl = () => {
      if (import.meta.env.VITE_MONGO_API_URL) {
        return import.meta.env.VITE_MONGO_API_URL
      }
      if (import.meta.env.VITE_API_ENDPOINT) {
        return import.meta.env.VITE_API_ENDPOINT
      }
      // Production'da (localhost değilse) window.location.origin kullan
      if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
        return window.location.origin
      }
      return 'http://localhost:3000'
    }
    this.MONGO_API_URL = getApiUrl()
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
      currency: { success: false, duration: 0, apiStatuses: [] },
      fedRate: { success: false, duration: 0, apiStatuses: [] },
      supplyTracking: { success: false, duration: 0, apiStatuses: [] }
    }

    try {
      // ========== 1. CRYPTO VERİLERİ (Home sayfası için) ==========
      const cryptoStartTime = Date.now()
      try {
        // ÖNCE MongoDB'den çek (hızlı, cache'den)
        const MONGO_API_URL = this.MONGO_API_URL
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
                // Debug: total_supply ve max_supply kontrolü
                const sampleCoin = coins[0]
                const coinsWithTotalSupply = coins.filter(c => c.total_supply !== null && c.total_supply !== undefined).length
                const coinsWithMaxSupply = coins.filter(c => c.max_supply !== null && c.max_supply !== undefined).length
                
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
        const MONGO_API_URL = this.MONGO_API_URL
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
        const MONGO_API_URL = this.MONGO_API_URL
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

      // ========== 6. FED RATE VERİLERİ (FedRate sayfası için) ==========
      const fedRateStartTime = Date.now()
      try {
        const MONGO_API_URL = this.MONGO_API_URL
        let fedRateResult = null
        let fedRateApiStatuses = []
        
        try {
          const mongoResponse = await fetch(`${MONGO_API_URL}/api/fed-rate`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000) // 10 saniye timeout
          })
          
          if (mongoResponse.ok) {
            const mongoResult = await mongoResponse.json()
            if (mongoResult.success && mongoResult.data) {
              fedRateResult = mongoResult.data
              fedRateApiStatuses.push({ name: 'MongoDB Fed Rate', success: true })
            }
          } else if (mongoResponse.status === 404) {
            // Cache yoksa veya geçersizse, backend'e update isteği gönder
            const updateResponse = await fetch(`${MONGO_API_URL}/api/fed-rate/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            })
            
            if (updateResponse.ok) {
              const updateResult = await updateResponse.json()
              if (updateResult.success && updateResult.data) {
                fedRateResult = updateResult.data
                fedRateApiStatuses.push({ name: 'Backend Fed Rate Update', success: true })
              }
            } else {
              fedRateApiStatuses.push({ name: 'Backend Fed Rate Update', success: false, error: `HTTP ${updateResponse.status}` })
            }
          }
        } catch (mongoError) {
          fedRateApiStatuses.push({ name: 'MongoDB Fed Rate', success: false, error: mongoError.message })
        }
        
        // MongoDB'den gelen veriyi kullan
        if (fedRateResult) {
          this.fedRateData = fedRateResult
          this.lastFedRateUpdate = Date.now()
          results.fedRate.success = true
        }
        
        results.fedRate.duration = ((Date.now() - fedRateStartTime) / 1000).toFixed(2)
        results.fedRate.apiStatuses = fedRateApiStatuses
      } catch (error) {
        results.fedRate.duration = ((Date.now() - fedRateStartTime) / 1000).toFixed(2)
        if (error.apiStatuses) {
          results.fedRate.apiStatuses = error.apiStatuses
        }
        console.error(`❌ [${timeStr}] Fed Rate hatası:`, error.message || error)
      }

      // ========== 7. SUPPLY TRACKING VERİLERİ (SupplyTracking sayfası için) ==========
      const supplyTrackingStartTime = Date.now()
      try {
        const MONGO_API_URL = this.MONGO_API_URL
        let supplyTrackingResult = null
        let supplyTrackingApiStatuses = []
        
        try {
          const mongoResponse = await fetch(`${MONGO_API_URL}/cache/supply_tracking`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000) // 10 saniye timeout
          })
          
          if (mongoResponse.ok) {
            const mongoResult = await mongoResponse.json()
            if (mongoResult.success && mongoResult.data) {
              // Backend'den gelen formatı kontrol et
              supplyTrackingResult = mongoResult.data.data || mongoResult.data
              supplyTrackingApiStatuses.push({ name: 'MongoDB Supply Tracking', success: true })
            }
          } else if (mongoResponse.status === 404) {
            supplyTrackingApiStatuses.push({ name: 'MongoDB Supply Tracking', success: false, error: 'Not found (404)' })
          }
        } catch (mongoError) {
          supplyTrackingApiStatuses.push({ name: 'MongoDB Supply Tracking', success: false, error: mongoError.message })
        }
        
        // MongoDB'den veri yoksa, backend scheduler zaten güncelliyor
        if (!supplyTrackingResult || Object.keys(supplyTrackingResult).length === 0) {
          supplyTrackingApiStatuses.push({ name: 'Backend Scheduler', success: true, message: 'Veri backend scheduler tarafından güncellenecek' })
        }
        
        // MongoDB'den gelen veriyi kullan
        if (supplyTrackingResult && Object.keys(supplyTrackingResult).length > 0) {
          this.supplyTrackingData = supplyTrackingResult
          this.lastSupplyTrackingUpdate = Date.now()
          results.supplyTracking.success = true
        }
        
        results.supplyTracking.duration = ((Date.now() - supplyTrackingStartTime) / 1000).toFixed(2)
        results.supplyTracking.apiStatuses = supplyTrackingApiStatuses
      } catch (error) {
        results.supplyTracking.duration = ((Date.now() - supplyTrackingStartTime) / 1000).toFixed(2)
        if (error.apiStatuses) {
          results.supplyTracking.apiStatuses = error.apiStatuses
        }
        console.error(`❌ [${timeStr}] Supply Tracking hatası:`, error.message || error)
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
      
      console.log(`🏦 [${timeStr}] Fed Rate: ${results.fedRate.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.fedRate.duration}s)`)
      if (results.fedRate.apiStatuses && results.fedRate.apiStatuses.length > 0) {
        results.fedRate.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      }
      
      console.log(`📊 [${timeStr}] Supply Tracking: ${results.supplyTracking.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.supplyTracking.duration}s)`)
      if (results.supplyTracking.apiStatuses && results.supplyTracking.apiStatuses.length > 0) {
        results.supplyTracking.apiStatuses.forEach(status => {
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
    
    // WebSocket ile real-time güncellemeleri dinle
    this.setupRealtimeListeners()
    
    // İlk başlatmada sadece MongoDB'den mevcut veriyi yükle (API çağrısı yapma)
    this.loadFromMongoDBOnly().catch(() => {})
    
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
  
  // Sadece MongoDB'den mevcut veriyi yükle (API çağrısı yapmadan)
  async loadFromMongoDBOnly() {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.log(`📥 [${timeStr}] MongoDB'den mevcut veriler yükleniyor...`)
    
    try {
      const MONGO_API_URL = this.MONGO_API_URL
      
      // 1. Crypto verileri
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/cache/crypto_list`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        })
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            const coins = mongoResult.data.coins || mongoResult.data.data?.coins || []
            if (Array.isArray(coins) && coins.length > 0) {
              // Debug: total_supply ve max_supply kontrolü
              const sampleCoin = coins[0]
              const coinsWithTotalSupply = coins.filter(c => c.total_supply !== null && c.total_supply !== undefined).length
              const coinsWithMaxSupply = coins.filter(c => c.max_supply !== null && c.max_supply !== undefined).length
              
              this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
              this.topMovers = this.calculateTopMovers(this.coins)
              this.lastCryptoUpdate = new Date()
              dataUpdated = true
              
              console.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${this.coins.length} coin)`)
              
              // Debug: Set edildikten sonra kontrol
              const sampleCoinAfter = this.coins[0]
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Crypto verisi yüklenemedi:`, error.message)
      }
      
      // 2. Dominance verileri
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            this.dominanceData = mongoResult.data
            this.lastDominanceUpdate = Date.now()
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Dominance verisi yüklenemedi:`, error.message)
      }
      
      // 3. Fear & Greed
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/fear_greed`)
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            this.fearGreedIndex = mongoResult.data
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Fear & Greed verisi yüklenemedi:`, error.message)
      }
      
      // 4. Trending verileri
      try {
        const trendingResponse = await fetch(`${MONGO_API_URL}/api/trending`)
        if (trendingResponse.ok) {
          const trendingResult = await trendingResponse.json()
          if (trendingResult.success && trendingResult.data) {
            this.trendingCoins = trendingResult.data.coins || []
            this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Trending verisi yüklenemedi:`, error.message)
      }
      
      // 5. Currency rates
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/currency_rates`)
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            this.currencyRates = mongoResult.data
            this.lastCurrencyUpdate = Date.now()
            if (typeof window !== 'undefined') {
              window.__exchangeRates = this.currencyRates
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Currency rates yüklenemedi:`, error.message)
      }
      
      // 6. Fed Rate
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/api/fed-rate`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        })
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            this.fedRateData = mongoResult.data
            this.lastFedRateUpdate = Date.now()
            console.log(`✅ [${timeStr}] Fed Rate verisi MongoDB'den yüklendi`)
          } else {
            console.warn(`⚠️ [${timeStr}] Fed Rate verisi MongoDB'de bulunamadı (success: ${mongoResult.success})`)
          }
        } else if (mongoResponse.status === 404) {
          // Cache yoksa, backend'den çekmeyi dene (sayfa bozulmasın)
          console.log(`⚠️ [${timeStr}] Fed Rate verisi MongoDB'de yok (404), backend'den çekiliyor...`)
          try {
            const updateResponse = await fetch(`${MONGO_API_URL}/api/fed-rate/update`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(15000)
            })
            if (updateResponse.ok) {
              const updateResult = await updateResponse.json()
              if (updateResult.success && updateResult.data) {
                this.fedRateData = updateResult.data
                this.lastFedRateUpdate = Date.now()
                console.log(`✅ [${timeStr}] Fed Rate verisi backend'den çekildi`)
              } else {
                console.warn(`⚠️ [${timeStr}] Fed Rate backend güncelleme başarısız (success: ${updateResult.success})`)
              }
            } else {
              console.warn(`⚠️ [${timeStr}] Fed Rate backend güncelleme hatası: HTTP ${updateResponse.status}`)
            }
          } catch (updateError) {
            console.warn(`⚠️ [${timeStr}] Fed Rate backend güncelleme hatası:`, updateError.message)
          }
        } else {
          console.warn(`⚠️ [${timeStr}] Fed Rate verisi yüklenemedi: HTTP ${mongoResponse.status}`)
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Fed Rate verisi yüklenemedi:`, error.message)
      }
      
      // 7. Supply Tracking
      try {
        const mongoResponse = await fetch(`${MONGO_API_URL}/cache/supply_tracking`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000)
        })
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data) {
            this.supplyTrackingData = mongoResult.data.data || mongoResult.data
            this.lastSupplyTrackingUpdate = Date.now()
          }
        }
      } catch (error) {
        console.warn(`⚠️ [${timeStr}] Supply Tracking verisi yüklenemedi:`, error.message)
      }
      
      // Abonelere bildir
      this.notifySubscribers()
      
      const nextUpdateTime = new Date(Date.now() + this.getNextUpdateTime()).toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] MongoDB'den mevcut veriler yüklendi`)
      console.log(`⏰ Bir sonraki güncelleme: ${nextUpdateTime}`)
    } catch (error) {
      console.error(`❌ [${timeStr}] MongoDB yükleme hatası:`, error.message || error)
    }
  }

  // WebSocket ile real-time güncellemeleri dinle
  setupRealtimeListeners() {
    // api_cache collection'ındaki crypto_list güncellemelerini dinle
    realtimeService.subscribe('api_cache', (message) => {
      if (message.operationType === 'update' || message.operationType === 'replace') {
        const documentId = message.documentId || message.fullDocument?._id
        if (documentId === 'crypto_list') {
          const data = message.fullDocument || message.data
          if (data && data.coins) {
            const coins = Array.isArray(data.coins) ? data.coins : []
            if (coins.length > 0) {
              console.log(`🔄 [WebSocket] Crypto list güncellendi (${coins.length} coin)`)
              this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
              this.topMovers = this.calculateTopMovers(this.coins)
              this.lastCryptoUpdate = new Date()
              this.notifySubscribers()
            }
          }
        }
      }
    })
    
    // Custom event'leri de dinle (geriye dönük uyumluluk için)
    if (typeof window !== 'undefined') {
      const handleCryptoUpdate = (event) => {
        const { documentId, data } = event.detail || {}
        if (documentId === 'crypto_list' && data && data.coins) {
          const coins = Array.isArray(data.coins) ? data.coins : []
          if (coins.length > 0) {
            console.log(`🔄 [Event] Crypto list güncellendi (${coins.length} coin)`)
            this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
            this.topMovers = this.calculateTopMovers(this.coins)
            this.lastCryptoUpdate = new Date()
            this.notifySubscribers()
          }
        }
      }
      
      window.addEventListener('mongodb:api_cache:update', handleCryptoUpdate)
      window.addEventListener('mongodb:api_cache:replace', handleCryptoUpdate)
    }
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
      
      // Fed Rate verileri
      fedRateData: this.fedRateData,
      lastFedRateUpdate: this.lastFedRateUpdate,
      
      // Supply Tracking verileri
      supplyTrackingData: this.supplyTrackingData,
      lastSupplyTrackingUpdate: this.lastSupplyTrackingUpdate,
      
      // Genel durum
      isUpdating: this.isUpdating
    }
  }
}

// Singleton instance
const globalDataManager = new GlobalDataManager()

export default globalDataManager
