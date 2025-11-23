// Merkezi Global Veri Yönetim Sistemi
// TÜM veri çekme işlemleri buradan yönetilir
// 5 dakikada bir tüm veriler güncellenir (00:00, 00:05, 00:10, ...)
// Sayfa açık olmasa bile veriler güncellenir

import cryptoService from '../services/cryptoService'
import dominanceService from '../services/dominanceService'
import fearGreedService from '../services/fearGreedService'
import realtimeService from '../services/realtimeService'
import logger from '../utils/logger'
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
    
    // localStorage cache keys
    this.CACHE_KEYS = {
      crypto: 'global_crypto_data',
      dominance: 'global_dominance_data',
      fearGreed: 'global_fear_greed_data',
      trending: 'global_trending_data',
      currency: 'global_currency_data',
      fedRate: 'global_fed_rate_data',
      supplyTracking: 'global_supply_tracking_data'
    }
    
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
    
    // Constructor'da localStorage'dan verileri yükle (anında göster)
    this.loadFromLocalStorage()
    
    // localStorage'da eksik veriler varsa MongoDB'den çek (ANINDA, öncelikli)
    // MONGO_API_URL set edildikten sonra çağrılmalı
    if (typeof window !== 'undefined') {
      // Browser'da çalışıyorsa ANINDA çağır (setTimeout veya Promise.resolve() olmadan)
      // Cache yoksa ANINDA MongoDB'den çek
      // Async olarak çalıştır ama await bekleme - anında başlat
      this.loadMissingDataFromMongoDB().catch(() => {
        // Hata olsa bile sessizce devam et
      })
    }
  }

  // localStorage'dan verileri yükle
  loadFromLocalStorage() {
    try {
      // Crypto verileri
      const cryptoCache = localStorage.getItem(this.CACHE_KEYS.crypto)
      if (cryptoCache) {
        const { coins, topMovers, lastCryptoUpdate } = JSON.parse(cryptoCache)
        if (coins && Array.isArray(coins) && coins.length > 0) {
          this.coins = coins
          // topMovers yoksa veya boşsa hemen hesapla (MongoDB'den bekleme)
          if (!topMovers || !topMovers.topGainers || topMovers.topGainers.length === 0 || !topMovers.topLosers || topMovers.topLosers.length === 0) {
            this.topMovers = this.calculateTopMovers(coins)
          } else {
            this.topMovers = topMovers
          }
          this.lastCryptoUpdate = lastCryptoUpdate ? new Date(lastCryptoUpdate) : null
        }
      }
      
      // Dominance verileri
      const dominanceCache = localStorage.getItem(this.CACHE_KEYS.dominance)
      if (dominanceCache) {
        const { data, lastUpdate } = JSON.parse(dominanceCache)
        if (data) {
          this.dominanceData = data
          this.lastDominanceUpdate = lastUpdate || Date.now()
        }
      }
      
      // Fear & Greed
      const fearGreedCache = localStorage.getItem(this.CACHE_KEYS.fearGreed)
      if (fearGreedCache) {
        const data = JSON.parse(fearGreedCache)
        if (data) {
          this.fearGreedIndex = data
        }
      }
      
      // Trending verileri
      const trendingCache = localStorage.getItem(this.CACHE_KEYS.trending)
      if (trendingCache) {
        const { coins, lastUpdate } = JSON.parse(trendingCache)
        if (coins && Array.isArray(coins) && coins.length > 0) {
          this.trendingCoins = coins
          this.lastTrendingUpdate = lastUpdate || Date.now()
        }
      }
      
      // Currency rates
      const currencyCache = localStorage.getItem(this.CACHE_KEYS.currency)
      if (currencyCache) {
        const { data, lastUpdate } = JSON.parse(currencyCache)
        if (data) {
          this.currencyRates = data
          this.lastCurrencyUpdate = lastUpdate || Date.now()
          if (typeof window !== 'undefined') {
            window.__exchangeRates = this.currencyRates
          }
        }
      }
      
      // Fed Rate
      const fedRateCache = localStorage.getItem(this.CACHE_KEYS.fedRate)
      if (fedRateCache) {
        const { data, lastUpdate } = JSON.parse(fedRateCache)
        if (data) {
          this.fedRateData = data
          this.lastFedRateUpdate = lastUpdate || Date.now()
        }
      }
      
      // Supply Tracking
      const supplyTrackingCache = localStorage.getItem(this.CACHE_KEYS.supplyTracking)
      if (supplyTrackingCache) {
        const { data, lastUpdate } = JSON.parse(supplyTrackingCache)
        if (data) {
          this.supplyTrackingData = data
          this.lastSupplyTrackingUpdate = lastUpdate || Date.now()
        }
      }
      
      // localStorage'dan yüklendikten sonra abonelere bildir (localStorage kaydetme yapmadan)
      const data = this.getData()
      this.subscribers.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error('Error notifying global subscriber:', error)
        }
      })
    } catch (error) {
      // localStorage yükleme hatası - sessizce devam et
    }
  }

  // localStorage'da eksik veriler varsa MongoDB'den çek (ANINDA, öncelikli)
  // Sidebar sırasına göre: 1. Home (crypto) -> 2. Market Overview (dominance) -> diğerleri (paralel)
  async loadMissingDataFromMongoDB() {
    // API URL yoksa çık
    if (!this.MONGO_API_URL) {
      return
    }
    
    try {
      const MONGO_API_URL = this.MONGO_API_URL
      
      // ÖNCELİKLİ VERİLER (Sırayla çek):
      // 1. Home (crypto) - EN ÖNCE
      if (!this.coins || this.coins.length === 0) {
        try {
          const res = await fetch(`${MONGO_API_URL}/cache/crypto_list`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000) // 8 saniye timeout (daha uzun)
          })
          if (res.ok) {
            const result = await res.json()
            if (result.success && result.data) {
              const coins = result.data.coins || result.data.data?.coins || []
              if (Array.isArray(coins) && coins.length > 0) {
                this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
                this.topMovers = this.calculateTopMovers(this.coins) // ANINDA hesapla
                this.lastCryptoUpdate = new Date()
                this.saveToLocalStorage() // ANINDA kaydet
                this.notifySubscribers() // ANINDA bildir (topMovers ile birlikte)
              }
            }
          }
        } catch (error) {
          // Sessizce devam et
        }
      } else if (!this.topMovers || !this.topMovers.topGainers || this.topMovers.topGainers.length === 0 || !this.topMovers.topLosers || this.topMovers.topLosers.length === 0) {
        // Coins var ama topMovers eksikse hemen hesapla (MongoDB'den bekleme yok)
        this.topMovers = this.calculateTopMovers(this.coins)
        this.saveToLocalStorage() // Hesaplanmış topMovers'ı kaydet
        this.notifySubscribers() // ANINDA bildir
      }
      
      // 2. Market Overview (dominance) - İKİNCİ ÖNCELİK
      if (!this.dominanceData) {
        try {
          const res = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000) // 8 saniye timeout (daha uzun)
          })
          if (res.ok) {
            const result = await res.json()
            if (result.success && result.data) {
              this.dominanceData = result.data
              this.lastDominanceUpdate = Date.now()
              this.saveToLocalStorage()
              this.notifySubscribers() // ANINDA bildir
            }
          }
        } catch (error) {
          // Sessizce devam et
        }
      }
      
      // DİĞER VERİLER (Paralel çek):
      const missingData = []
      if (!this.fearGreedIndex) {
        missingData.push('fearGreed')
      }
      if (!this.trendingCoins || this.trendingCoins.length === 0) {
        missingData.push('trending')
      }
      if (!this.currencyRates) {
        missingData.push('currency')
      }
      if (!this.fedRateData) {
        missingData.push('fedRate')
      }
      if (!this.supplyTrackingData) {
        missingData.push('supplyTracking')
      }
      
      if (missingData.length === 0) {
        return
      }
      
      // Diğer verileri paralel olarak çek
      const promises = []
        
        if (missingData.includes('fearGreed')) {
          promises.push(
            fetch(`${MONGO_API_URL}/api/cache/fear_greed`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000) // 3 saniye timeout
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json()
                  if (result.success && result.data) {
                    this.fearGreedIndex = result.data
                    this.saveToLocalStorage()
                    this.notifySubscribers()
                  }
                }
              })
              .catch(() => {})
          )
        }
        
        if (missingData.includes('trending')) {
          promises.push(
            fetch(`${MONGO_API_URL}/api/trending`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000) // 3 saniye timeout
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json()
                  if (result.success && result.data) {
                    this.trendingCoins = result.data.coins || []
                    this.lastTrendingUpdate = result.data.updatedAt || Date.now()
                    this.saveToLocalStorage()
                    this.notifySubscribers()
                  }
                }
              })
              .catch(() => {})
          )
        }
        
        if (missingData.includes('currency')) {
          promises.push(
            fetch(`${MONGO_API_URL}/api/cache/currency_rates`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000) // 3 saniye timeout
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json()
                  if (result.success && result.data) {
                    this.currencyRates = result.data
                    this.lastCurrencyUpdate = Date.now()
                    if (typeof window !== 'undefined') {
                      window.__exchangeRates = this.currencyRates
                    }
                    this.saveToLocalStorage()
                    this.notifySubscribers()
                  }
                }
              })
              .catch(() => {})
          )
        }
        
        if (missingData.includes('fedRate')) {
          promises.push(
            fetch(`${MONGO_API_URL}/api/fed-rate`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000) // 3 saniye timeout
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json()
                  if (result.success && result.data) {
                    this.fedRateData = result.data
                    this.lastFedRateUpdate = Date.now()
                    this.saveToLocalStorage()
                    this.notifySubscribers()
    }
                }
              })
              .catch(() => {})
          )
        }
        
        if (missingData.includes('supplyTracking')) {
          promises.push(
            fetch(`${MONGO_API_URL}/cache/supply_tracking`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(3000) // 3 saniye timeout
            })
              .then(async (res) => {
                if (res.ok) {
                  const result = await res.json()
                  if (result.success && result.data) {
                    this.supplyTrackingData = result.data.data || result.data
                    this.lastSupplyTrackingUpdate = Date.now()
                    this.saveToLocalStorage()
                    this.notifySubscribers()
                  }
                }
              })
              .catch(() => {})
          )
        }
        
      // Tüm istekleri ANINDA paralel olarak çalıştır (bekleme yok)
      await Promise.allSettled(promises)
    } catch (error) {
      // Sessizce devam et
    }
  }

  // Verileri localStorage'a kaydet
  saveToLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return // SSR veya localStorage yoksa çık
    }
    
    try {
      // Crypto verileri
      if (this.coins && this.coins.length > 0) {
        try {
        localStorage.setItem(this.CACHE_KEYS.crypto, JSON.stringify({
          coins: this.coins,
          topMovers: this.topMovers,
          lastCryptoUpdate: this.lastCryptoUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Dominance verileri
      if (this.dominanceData) {
        try {
        localStorage.setItem(this.CACHE_KEYS.dominance, JSON.stringify({
          data: this.dominanceData,
          lastUpdate: this.lastDominanceUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Fear & Greed
      if (this.fearGreedIndex) {
        try {
        localStorage.setItem(this.CACHE_KEYS.fearGreed, JSON.stringify(this.fearGreedIndex))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Trending verileri
      if (this.trendingCoins && this.trendingCoins.length > 0) {
        try {
        localStorage.setItem(this.CACHE_KEYS.trending, JSON.stringify({
          coins: this.trendingCoins,
          lastUpdate: this.lastTrendingUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Currency rates
      if (this.currencyRates) {
        try {
        localStorage.setItem(this.CACHE_KEYS.currency, JSON.stringify({
          data: this.currencyRates,
          lastUpdate: this.lastCurrencyUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Fed Rate
      if (this.fedRateData) {
        try {
        localStorage.setItem(this.CACHE_KEYS.fedRate, JSON.stringify({
          data: this.fedRateData,
          lastUpdate: this.lastFedRateUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
      
      // Supply Tracking
      if (this.supplyTrackingData) {
        try {
        localStorage.setItem(this.CACHE_KEYS.supplyTracking, JSON.stringify({
          data: this.supplyTrackingData,
          lastUpdate: this.lastSupplyTrackingUpdate
        }))
        } catch (e) {
          // Sessizce devam et
        }
      }
    } catch (error) {
      // localStorage kaydetme hatası - sessizce devam et
    }
  }

  // Fed Rate verilerini set et (hook'tan çağrılabilir)
  setFedRateData(data, timestamp = null) {
    this.fedRateData = data
    this.lastFedRateUpdate = timestamp || Date.now()
    // localStorage'a kaydet
    if (data) {
      localStorage.setItem(this.CACHE_KEYS.fedRate, JSON.stringify({
        data: this.fedRateData,
        lastUpdate: this.lastFedRateUpdate
      }))
    }
    // Abonelere bildir
    this.notifySubscribers()
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
    
    // Veriler değiştiğinde localStorage'a kaydet
    this.saveToLocalStorage()
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
                logger.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${cryptoList.length} coin)`)
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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
                // localStorage'a hemen kaydet
                this.saveToLocalStorage()
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
                // localStorage'a hemen kaydet
                this.saveToLocalStorage()
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
              // localStorage'a hemen kaydet
              this.saveToLocalStorage()
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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
          // localStorage'a hemen kaydet
          this.saveToLocalStorage()
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

    } catch (error) {
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.error(`\n❌ [${timeStr}] ========== Global Veri Güncelleme Hatası ==========`)
      console.error(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      console.error(`❌ [${timeStr}] Hata:`, error.message || error)
      console.error(`═══════════════════════════════════════════════════════════\n`)
    } finally {
      this.isUpdating = false
      // Tüm veriler güncellendiğinde localStorage'a kaydet
      this.saveToLocalStorage()
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
    // Retry mekanizması ile backend hazır olana kadar dene - ANINDA YÜKLE
    this.loadFromMongoDBOnlyWithRetry().catch(() => {
      // Hata olsa bile abonelere bildir
      this.notifySubscribers()
    })
    
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
  
  // Sadece MongoDB'den mevcut veriyi yükle (API çağrısı yapmadan) - PARALEL YÜKLEME
  async loadFromMongoDBOnly() {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    logger.log(`📥 [${timeStr}] MongoDB'den mevcut veriler yükleniyor...`)
    
    // İlk başta abonelere bildir (loading state için)
    this.notifySubscribers()
    
    try {
      const MONGO_API_URL = this.MONGO_API_URL
      
      // TÜM VERİLERİ PARALEL YÜKLE (anında gelmesi için) - 3 saniye timeout ile
      const [
        cryptoResponse,
        dominanceResponse,
        fearGreedResponse,
        trendingResponse,
        currencyResponse,
        fedRateResponse,
        supplyTrackingResponse
      ] = await Promise.allSettled([
        fetch(`${MONGO_API_URL}/cache/crypto_list`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/api/cache/dominance_data`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/api/cache/fear_greed`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/api/trending`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/api/cache/currency_rates`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/api/fed-rate`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null),
        fetch(`${MONGO_API_URL}/cache/supply_tracking`, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(3000) // 3 saniye timeout
        }).catch(() => null)
      ])
      
      // 1. Crypto verileri
      if (cryptoResponse.status === 'fulfilled' && cryptoResponse.value && cryptoResponse.value.ok) {
        try {
          const mongoResult = await cryptoResponse.value.json()
          if (mongoResult.success && mongoResult.data) {
            const coins = mongoResult.data.coins || mongoResult.data.data?.coins || mongoResult.data || []
            if (Array.isArray(coins) && coins.length > 0) {
              this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
              this.topMovers = this.calculateTopMovers(this.coins)
              this.lastCryptoUpdate = new Date()
              // localStorage'a kaydet
              this.saveToLocalStorage()
              logger.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${this.coins.length} coin)`)
            }
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // 2. Dominance verileri
      if (dominanceResponse.status === 'fulfilled' && dominanceResponse.value && dominanceResponse.value.ok) {
        try {
          const mongoResult = await dominanceResponse.value.json()
          if (mongoResult.success && mongoResult.data) {
            this.dominanceData = mongoResult.data
            this.lastDominanceUpdate = Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            logger.log(`✅ [${timeStr}] Dominance verisi MongoDB'den yüklendi`)
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // 3. Fear & Greed
      if (fearGreedResponse.status === 'fulfilled' && fearGreedResponse.value && fearGreedResponse.value.ok) {
        try {
          const mongoResult = await fearGreedResponse.value.json()
          if (mongoResult.success && mongoResult.data) {
            this.fearGreedIndex = mongoResult.data
            // localStorage'a kaydet
            this.saveToLocalStorage()
            logger.log(`✅ [${timeStr}] Fear & Greed verisi MongoDB'den yüklendi`)
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // 4. Trending verileri
      if (trendingResponse.status === 'fulfilled' && trendingResponse.value && trendingResponse.value.ok) {
        try {
          const trendingResult = await trendingResponse.value.json()
          if (trendingResult.success && trendingResult.data) {
            this.trendingCoins = trendingResult.data.coins || []
            this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            logger.log(`✅ [${timeStr}] Trending verisi MongoDB'den yüklendi (${this.trendingCoins.length} coin)`)
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // 5. Currency rates
      if (currencyResponse.status === 'fulfilled' && currencyResponse.value && currencyResponse.value.ok) {
        try {
          const mongoResult = await currencyResponse.value.json()
          if (mongoResult.success && mongoResult.data) {
            this.currencyRates = mongoResult.data
            this.lastCurrencyUpdate = Date.now()
            if (typeof window !== 'undefined') {
              window.__exchangeRates = this.currencyRates
            }
            // localStorage'a kaydet
            this.saveToLocalStorage()
            logger.log(`✅ [${timeStr}] Currency rates MongoDB'den yüklendi`)
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // 6. Fed Rate
      if (fedRateResponse.status === 'fulfilled' && fedRateResponse.value) {
        if (fedRateResponse.value.ok) {
          try {
            const mongoResult = await fedRateResponse.value.json()
            if (mongoResult.success && mongoResult.data) {
              this.fedRateData = mongoResult.data
              this.lastFedRateUpdate = Date.now()
              // localStorage'a kaydet
              this.saveToLocalStorage()
              logger.log(`✅ [${timeStr}] Fed Rate verisi MongoDB'den yüklendi`)
            }
          } catch (e) {
            // Sessizce geç
          }
        } else if (fedRateResponse.value.status === 404) {
          // Cache yoksa, backend'den çekmeyi dene (async, sayfa bozulmasın)
          fetch(`${MONGO_API_URL}/api/fed-rate/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          }).catch(() => {}) // Sessizce geç
        }
      }
      
      // 7. Supply Tracking
      if (supplyTrackingResponse.status === 'fulfilled' && supplyTrackingResponse.value && supplyTrackingResponse.value.ok) {
        try {
          const mongoResult = await supplyTrackingResponse.value.json()
          if (mongoResult.success && mongoResult.data) {
            this.supplyTrackingData = mongoResult.data.data || mongoResult.data
            this.lastSupplyTrackingUpdate = Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            logger.log(`✅ [${timeStr}] Supply Tracking verisi MongoDB'den yüklendi`)
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // Tüm veriler yüklendiğinde localStorage'a kaydet (son bir kez daha emin olmak için)
      this.saveToLocalStorage()
      
      // Abonelere bildir (veri yüklenmiş olsun veya olmasın) - ANINDA
      this.notifySubscribers()
      
      const nextUpdateTime = new Date(Date.now() + this.getNextUpdateTime()).toLocaleTimeString('tr-TR')
    } catch (error) {
      console.error(`❌ [${timeStr}] MongoDB yükleme hatası:`, error.message || error)
      // Hata olsa bile abonelere bildir (boş veri ile) - ANINDA
      this.notifySubscribers()
      throw error // Retry için hatayı fırlat
    }
  }

  // Retry mekanizması ile MongoDB'den veri yükle - HIZLI RETRY
  async loadFromMongoDBOnlyWithRetry() {
    const maxRetries = 5 // Daha az deneme
    let retryCount = 0
    
    while (retryCount < maxRetries) {
      try {
        await this.loadFromMongoDBOnly()
        // Başarılı olduysa çık
        return
      } catch (error) {
        retryCount++
        if (retryCount < maxRetries) {
          // 300ms bekle ve tekrar dene (çok hızlı)
          await new Promise(resolve => setTimeout(resolve, 300))
        } else {
          // Son denemede bile abonelere bildir (boş veri ile)
          this.notifySubscribers()
        }
      }
    }
  }

  // WebSocket ile real-time güncellemeleri dinle
  setupRealtimeListeners() {
    // api_cache collection'ındaki tüm güncellemeleri dinle
    realtimeService.subscribe('api_cache', (message) => {
      if (message.operationType === 'update' || message.operationType === 'replace') {
        const documentId = message.documentId || message.fullDocument?._id
        const data = message.fullDocument?.data || message.data?.data || message.fullDocument || message.data
        
        // Crypto list güncellemesi
        if (documentId === 'crypto_list') {
          const coins = data?.coins || data || []
          if (Array.isArray(coins) && coins.length > 0) {
            this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
            this.topMovers = this.calculateTopMovers(this.coins)
            this.lastCryptoUpdate = new Date()
            this.notifySubscribers()
          }
        }
        
        // Dominance data güncellemesi
        if (documentId === 'dominance_data') {
          if (data) {
            this.dominanceData = data
            this.lastDominanceUpdate = Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
        
        // Fear & Greed güncellemesi
        if (documentId === 'fear_greed') {
          if (data) {
            this.fearGreedIndex = data
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
        
        // Currency rates güncellemesi
        if (documentId === 'currency_rates') {
          if (data) {
            this.currencyRates = data
            this.lastCurrencyUpdate = Date.now()
            if (typeof window !== 'undefined') {
              window.__exchangeRates = this.currencyRates
            }
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
        
        // Fed Rate güncellemesi
        if (documentId === 'fed_rate') {
          if (data) {
            this.fedRateData = data
            this.lastFedRateUpdate = Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
        
        // Supply Tracking güncellemesi
        if (documentId === 'supply_tracking') {
          if (data) {
            this.supplyTrackingData = data.data || data
            this.lastSupplyTrackingUpdate = Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
      }
    })
    
    // trending_data collection'ındaki güncellemeleri dinle
    realtimeService.subscribe('trending_data', (message) => {
      if (message.operationType === 'update' || message.operationType === 'replace') {
        const documentId = message.documentId || message.fullDocument?._id
        if (documentId === 'trending_coins') {
          const data = message.fullDocument || message.data
          const coins = data?.coins || []
          if (Array.isArray(coins) && coins.length > 0) {
            this.trendingCoins = coins
            this.lastTrendingUpdate = data.updatedAt || Date.now()
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
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
            this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
            this.topMovers = this.calculateTopMovers(this.coins)
            this.lastCryptoUpdate = new Date()
            // localStorage'a kaydet
            this.saveToLocalStorage()
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
