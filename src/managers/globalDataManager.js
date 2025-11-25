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
    
    // Cache TTL (Time To Live) - 24 saat (86400000 ms)
    // Eski cache'ler otomatik olarak silinecek
    this.CACHE_TTL = 24 * 60 * 60 * 1000 // 24 saat
    
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
    // KRİTİK: Sadece mevcut veri YOKSA yükle (yeni veri geldikten sonra eski veriye dönme)
    if (typeof window !== 'undefined') {
      // Browser'da çalışıyorsa ANINDA çağır (setTimeout veya Promise.resolve() olmadan)
      // Cache yoksa ANINDA MongoDB'den çek
      // Async olarak çalıştır ama await bekleme - anında başlat
      // Sadece mevcut veri yoksa yükle (constructor'da loadFromLocalStorage() çağrıldı, eğer veri yoksa MongoDB'den çek)
      if (this.coins.length === 0) {
        this.loadMissingDataFromMongoDB().catch((error) => {
          console.error('❌ loadMissingDataFromMongoDB hatası:', error)
          // Hata olsa bile sessizce devam et
        })
      }
    }
  }

  // localStorage'dan verileri yükle (SADECE ilk yüklemede - yeni veri geldikten sonra çağrılmamalı)
  // NOT: Bu fonksiyon sadece constructor'da çağrılmalı, yeni veri geldikten sonra çağrılmamalı
  loadFromLocalStorage() {
    try {
      const now = Date.now()
      
      // Crypto verileri
      const cryptoCache = localStorage.getItem(this.CACHE_KEYS.crypto)
      if (cryptoCache) {
        try {
          const { coins, topMovers, lastCryptoUpdate, savedAt } = JSON.parse(cryptoCache)
          if (coins && Array.isArray(coins) && coins.length > 0) {
            // TTL kontrolü: Cache süresi dolmuşsa sil
            const cacheAge = savedAt ? (now - savedAt) : Infinity
            if (cacheAge > this.CACHE_TTL) {
              localStorage.removeItem(this.CACHE_KEYS.crypto)
              return // Eski cache silindi
            }
            
            // KRİTİK: Sadece mevcut veri YOKSA yükle (yeni veri geldikten sonra eski cache'e dönme)
            // Eğer mevcut veri varsa, cache'den yükleme (yeni veri zaten yüklenmiş)
            if (this.coins.length === 0) {
              // Mevcut veri yoksa cache'den yükle
              this.coins = coins
              // topMovers yoksa veya boşsa hemen hesapla (MongoDB'den bekleme)
              if (!topMovers || !topMovers.topGainers || topMovers.topGainers.length === 0 || !topMovers.topLosers || topMovers.topLosers.length === 0) {
                this.topMovers = this.calculateTopMovers(coins)
              } else {
                this.topMovers = topMovers
              }
              this.lastCryptoUpdate = lastCryptoUpdate ? new Date(lastCryptoUpdate) : null
            }
            // Mevcut veri varsa cache'den yükleme (yeni veri zaten yüklenmiş, eski cache'e dönme)
          }
        } catch (e) {
          // Geçersiz cache, sil
          localStorage.removeItem(this.CACHE_KEYS.crypto)
        }
      }
      
      // Dominance verileri
      const dominanceCache = localStorage.getItem(this.CACHE_KEYS.dominance)
      if (dominanceCache) {
        try {
          const { data, lastUpdate, savedAt } = JSON.parse(dominanceCache)
          // TTL kontrolü
          if (savedAt && (now - savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.dominance)
          } else if (data && !this.dominanceData) {
            // Sadece mevcut veri YOKSA yükle
            this.dominanceData = data
            this.lastDominanceUpdate = lastUpdate || Date.now()
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.dominance)
        }
      }
      
      // Fear & Greed
      const fearGreedCache = localStorage.getItem(this.CACHE_KEYS.fearGreed)
      if (fearGreedCache) {
        try {
          const parsed = JSON.parse(fearGreedCache)
          // Eski format kontrolü (sadece data) veya yeni format (data + savedAt)
          if (parsed.savedAt && (now - parsed.savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.fearGreed)
          } else if ((parsed.data || (!parsed.savedAt && parsed.value !== undefined)) && !this.fearGreedIndex) {
            // Sadece mevcut veri YOKSA yükle
            this.fearGreedIndex = parsed.data || parsed
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.fearGreed)
        }
      }
      
      // Trending verileri
      const trendingCache = localStorage.getItem(this.CACHE_KEYS.trending)
      if (trendingCache) {
        try {
          const { coins, lastUpdate, savedAt } = JSON.parse(trendingCache)
          // TTL kontrolü
          if (savedAt && (now - savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.trending)
          } else if (coins && Array.isArray(coins) && coins.length > 0 && this.trendingCoins.length === 0) {
            // Sadece mevcut veri YOKSA yükle
            this.trendingCoins = coins
            this.lastTrendingUpdate = lastUpdate || Date.now()
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.trending)
        }
      }
      
      // Currency rates
      const currencyCache = localStorage.getItem(this.CACHE_KEYS.currency)
      if (currencyCache) {
        try {
          const { data, lastUpdate, savedAt } = JSON.parse(currencyCache)
          // TTL kontrolü
          if (savedAt && (now - savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.currency)
          } else if (data && !this.currencyRates) {
            // Sadece mevcut veri YOKSA yükle
            this.currencyRates = data
            this.lastCurrencyUpdate = lastUpdate || Date.now()
            if (typeof window !== 'undefined') {
              window.__exchangeRates = this.currencyRates
            }
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.currency)
        }
      }
      
      // Fed Rate
      const fedRateCache = localStorage.getItem(this.CACHE_KEYS.fedRate)
      if (fedRateCache) {
        try {
          const { data, lastUpdate, savedAt } = JSON.parse(fedRateCache)
          // TTL kontrolü
          if (savedAt && (now - savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.fedRate)
          } else if (data && !this.fedRateData) {
            // Sadece mevcut veri YOKSA yükle
            this.fedRateData = data
            this.lastFedRateUpdate = lastUpdate || Date.now()
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.fedRate)
        }
      }
      
      // Supply Tracking
      const supplyTrackingCache = localStorage.getItem(this.CACHE_KEYS.supplyTracking)
      if (supplyTrackingCache) {
        try {
          const { data, lastUpdate, savedAt } = JSON.parse(supplyTrackingCache)
          // TTL kontrolü
          if (savedAt && (now - savedAt) > this.CACHE_TTL) {
            localStorage.removeItem(this.CACHE_KEYS.supplyTracking)
          } else if (data && !this.supplyTrackingData) {
            // Sadece mevcut veri YOKSA yükle
            this.supplyTrackingData = data
            this.lastSupplyTrackingUpdate = lastUpdate || Date.now()
          }
        } catch (e) {
          localStorage.removeItem(this.CACHE_KEYS.supplyTracking)
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
      // 1. Home (crypto) - EN ÖNCE (retry mekanizması ile)
      // KRİTİK: Sadece mevcut veri YOKSA yükle (yeni veri geldikten sonra eski veriye dönme)
      if (!this.coins || this.coins.length === 0) {
        console.log('📥 MongoDB\'den crypto verileri çekiliyor...', `${MONGO_API_URL}/cache/crypto_list`)
        let retryCount = 0
        const maxRetries = 2 // 2 kez dene
        let success = false
        
        while (retryCount < maxRetries && !success) {
          try {
            console.log(`📥 Deneme ${retryCount + 1}/${maxRetries}...`)
            const res = await fetch(`${MONGO_API_URL}/cache/crypto_list`, {
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(30000) // 30 saniye timeout (MongoDB query 17+ saniye sürebiliyor)
            })
            console.log('📥 Crypto fetch sonucu:', res.status, res.ok)
            if (res.ok) {
              const result = await res.json()
              console.log('📥 Crypto veri alındı:', result)
              console.log('📥 result.success:', result.success)
              console.log('📥 result.data:', result.data ? 'var' : 'yok')
              console.log('📥 result.data.coins:', result.data?.coins?.length || 0)
              
              if (result.success && result.data) {
                // Backend formatı: { success: true, data: { coins: [...], lastUpdate: ... } }
                const coins = result.data.coins || []
                console.log('📥 Parsed coins:', coins.length)
                
                if (Array.isArray(coins) && coins.length > 0) {
                  console.log(`✅ ${coins.length} coin yüklendi`)
                  // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
                  localStorage.removeItem(this.CACHE_KEYS.crypto)
                  
                  this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
                  this.topMovers = this.calculateTopMovers(this.coins) // ANINDA hesapla
                  this.lastCryptoUpdate = new Date()
                  this.saveToLocalStorage() // ANINDA kaydet
                  console.log('✅ topMovers hesaplandı:', this.topMovers.topGainers.length, 'gainers,', this.topMovers.topLosers.length, 'losers')
                  this.notifySubscribers() // ANINDA bildir (topMovers ile birlikte)
                  console.log('✅ Subscribers bildirildi')
                  success = true
                } else {
                  console.warn('⚠️ Coin array boş veya geçersiz, length:', coins?.length || 0, 'isArray:', Array.isArray(coins))
                  break // Retry yapma, veri yok
                }
              } else {
                console.warn('⚠️ API success=false veya data yok, result:', result)
                // 404 ise veri yok, retry yapma
                if (result.error === 'Crypto list verisi bulunamadı') {
                  console.warn('⚠️ MongoDB\'de veri yok, backend\'den veri çekilmeli')
                  break
                }
                retryCount++
                if (retryCount < maxRetries) {
                  await new Promise(resolve => setTimeout(resolve, 1000)) // 1 saniye bekle
                }
              }
            } else {
              const errorText = await res.text().catch(() => '')
              console.warn('⚠️ API response OK değil:', res.status, res.statusText, errorText)
              // 404 veya 503 ise retry yapma
              if (res.status === 404 || res.status === 503) {
                console.warn('⚠️ Backend veri yok veya MongoDB bağlantısı yok')
                break
              }
              retryCount++
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000)) // 1 saniye bekle
              }
            }
          } catch (error) {
            console.error(`❌ Crypto fetch hatası (deneme ${retryCount + 1}/${maxRetries}):`, error.message || error)
            retryCount++
            if (retryCount < maxRetries && error.name === 'TimeoutError') {
              console.log(`⏳ Timeout oldu, ${retryCount + 1}. deneme yapılıyor...`)
              await new Promise(resolve => setTimeout(resolve, 2000)) // 2 saniye bekle
            } else {
              break // Timeout değilse veya max retry'ye ulaştıysak dur
            }
          }
        }
        
        if (!success) {
          console.error('❌ Tüm denemeler başarısız, crypto verisi yüklenemedi')
          // Backend timeout oluyorsa, backend'e veri çekme isteği gönder
          console.log('🔄 Backend\'e veri çekme isteği gönderiliyor...')
          try {
            const updateRes = await fetch(`${MONGO_API_URL}/api/crypto/update`, {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(30000) // 30 saniye timeout (veri çekme uzun sürebilir)
            })
            if (updateRes.ok) {
              console.log('✅ Backend veri çekme isteği gönderildi, 2 saniye bekleniyor...')
              await new Promise(resolve => setTimeout(resolve, 2000)) // 2 saniye bekle, backend veri çeksin
              
              // Tekrar dene
              console.log('🔄 Veri çekildikten sonra tekrar deneme yapılıyor...')
              const retryRes = await fetch(`${MONGO_API_URL}/cache/crypto_list`, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(30000) // 30 saniye timeout (MongoDB query 17+ saniye sürebiliyor)
              })
              if (retryRes.ok) {
                const retryResult = await retryRes.json()
                if (retryResult.success && retryResult.data) {
                  const coins = retryResult.data.coins || []
                  if (Array.isArray(coins) && coins.length > 0) {
                    console.log(`✅ ${coins.length} coin yüklendi (backend'den veri çekme sonrası)`)
                    this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
                    this.topMovers = this.calculateTopMovers(this.coins)
                    this.lastCryptoUpdate = new Date()
                    this.saveToLocalStorage()
                    this.notifySubscribers()
                    console.log('✅ Subscribers bildirildi (backend veri çekme sonrası)')
                  }
                }
              }
            } else {
              console.error('❌ Backend veri çekme isteği başarısız:', updateRes.status, updateRes.statusText)
            }
          } catch (updateError) {
            console.error('❌ Backend veri çekme isteği hatası:', updateError.message || updateError)
          }
        }
      } else if (!this.topMovers || !this.topMovers.topGainers || this.topMovers.topGainers.length === 0 || !this.topMovers.topLosers || this.topMovers.topLosers.length === 0) {
        // Coins var ama topMovers eksikse hemen hesapla (MongoDB'den bekleme yok)
        console.log('📊 topMovers hesaplanıyor (coins var ama topMovers eksik)')
        this.topMovers = this.calculateTopMovers(this.coins)
        this.saveToLocalStorage() // Hesaplanmış topMovers'ı kaydet
        this.notifySubscribers() // ANINDA bildir
        console.log('✅ topMovers hesaplandı ve bildirildi:', this.topMovers.topGainers.length, 'gainers,', this.topMovers.topLosers.length, 'losers')
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
              // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
              localStorage.removeItem(this.CACHE_KEYS.dominance)
              
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

  // Verileri localStorage'a kaydet (yeni veriler geldiğinde eski cache üzerine yazılır)
  saveToLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return // SSR veya localStorage yoksa çık
    }
    
    try {
      const savedAt = Date.now() // Kayıt zamanı (TTL kontrolü için)
      
      // Crypto verileri
      if (this.coins && this.coins.length > 0) {
        try {
          // Yeni veri geldiğinde eski cache üzerine yazılır (otomatik silinir)
          localStorage.setItem(this.CACHE_KEYS.crypto, JSON.stringify({
            coins: this.coins,
            topMovers: this.topMovers,
            lastCryptoUpdate: this.lastCryptoUpdate,
            savedAt // TTL kontrolü için
          }))
        } catch (e) {
          // localStorage dolu olabilir, eski cache'leri temizle
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.crypto, JSON.stringify({
              coins: this.coins,
              topMovers: this.topMovers,
              lastCryptoUpdate: this.lastCryptoUpdate,
              savedAt
            }))
          } catch (e2) {
            // Hala hata varsa sessizce devam et
          }
        }
      }
      
      // Dominance verileri
      if (this.dominanceData) {
        try {
          localStorage.setItem(this.CACHE_KEYS.dominance, JSON.stringify({
            data: this.dominanceData,
            lastUpdate: this.lastDominanceUpdate,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.dominance, JSON.stringify({
              data: this.dominanceData,
              lastUpdate: this.lastDominanceUpdate,
              savedAt
            }))
          } catch (e2) {}
        }
      }
      
      // Fear & Greed
      if (this.fearGreedIndex) {
        try {
          localStorage.setItem(this.CACHE_KEYS.fearGreed, JSON.stringify({
            data: this.fearGreedIndex,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.fearGreed, JSON.stringify({
              data: this.fearGreedIndex,
              savedAt
            }))
          } catch (e2) {}
        }
      }
      
      // Trending verileri
      if (this.trendingCoins && this.trendingCoins.length > 0) {
        try {
          localStorage.setItem(this.CACHE_KEYS.trending, JSON.stringify({
            coins: this.trendingCoins,
            lastUpdate: this.lastTrendingUpdate,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.trending, JSON.stringify({
              coins: this.trendingCoins,
              lastUpdate: this.lastTrendingUpdate,
              savedAt
            }))
          } catch (e2) {}
        }
      }
      
      // Currency rates
      if (this.currencyRates) {
        try {
          localStorage.setItem(this.CACHE_KEYS.currency, JSON.stringify({
            data: this.currencyRates,
            lastUpdate: this.lastCurrencyUpdate,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.currency, JSON.stringify({
              data: this.currencyRates,
              lastUpdate: this.lastCurrencyUpdate,
              savedAt
            }))
          } catch (e2) {}
        }
      }
      
      // Fed Rate
      if (this.fedRateData) {
        try {
          localStorage.setItem(this.CACHE_KEYS.fedRate, JSON.stringify({
            data: this.fedRateData,
            lastUpdate: this.lastFedRateUpdate,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.fedRate, JSON.stringify({
              data: this.fedRateData,
              lastUpdate: this.lastFedRateUpdate,
              savedAt
            }))
          } catch (e2) {}
        }
      }
      
      // Supply Tracking
      if (this.supplyTrackingData) {
        try {
          localStorage.setItem(this.CACHE_KEYS.supplyTracking, JSON.stringify({
            data: this.supplyTrackingData,
            lastUpdate: this.lastSupplyTrackingUpdate,
            savedAt
          }))
        } catch (e) {
          this.cleanupOldCache()
          try {
            localStorage.setItem(this.CACHE_KEYS.supplyTracking, JSON.stringify({
              data: this.supplyTrackingData,
              lastUpdate: this.lastSupplyTrackingUpdate,
              savedAt
            }))
          } catch (e2) {}
        }
      }
    } catch (error) {
      // localStorage kaydetme hatası - sessizce devam et
    }
  }
  
  // Eski cache'leri temizle (TTL geçmiş veya localStorage dolu)
  cleanupOldCache() {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }
    
    try {
      const now = Date.now()
      const cacheKeys = Object.values(this.CACHE_KEYS)
      
      // Tüm cache key'lerini kontrol et
      cacheKeys.forEach(key => {
        try {
          const cached = localStorage.getItem(key)
          if (cached) {
            const parsed = JSON.parse(cached)
            // TTL geçmişse sil
            if (parsed.savedAt && (now - parsed.savedAt) > this.CACHE_TTL) {
              localStorage.removeItem(key)
            }
          }
        } catch (e) {
          // Geçersiz cache, sil
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      // Sessizce devam et
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
    // KRİTİK: getData() her çağrıldığında güncel veriyi döndürmeli
    // Bu yüzden getData()'yı her callback için ayrı ayrı çağırmalıyız
    // Böylece her callback en güncel veriyi alır
    
    this.subscribers.forEach(callback => {
      try {
        // Her callback için güncel veriyi al (async güncellemeler için)
        const data = this.getData()
        callback(data)
      } catch (error) {
        console.error('❌ Error notifying global subscriber:', error)
      }
    })
    
    // NOT: saveToLocalStorage() artık sadece veri güncellendiğinde manuel olarak çağrılmalı
    // notifySubscribers() içinde otomatik çağrılmıyor - gereksiz kayıtları önlemek için
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
              // KRİTİK: Timestamp kontrolü - MongoDB'den gelen veri mevcut veriden daha yeni ise yükle
              const mongoTimestamp = mongoResult.data.lastUpdate ? new Date(mongoResult.data.lastUpdate).getTime() : Date.now()
              const currentTimestamp = this.lastCryptoUpdate ? new Date(this.lastCryptoUpdate).getTime() : 0
              
              // KRİTİK: WebSocket'ten gelen veri her zaman öncelikli
              // Eğer mevcut veri varsa ve MongoDB'den gelen veri mevcut veriden daha yeni DEĞİLSE yükleme
              // Sadece mevcut veri YOKSA veya MongoDB'den gelen veri kesinlikle daha yeni ise yükle
              if (this.coins.length === 0 || (mongoTimestamp > currentTimestamp + 1000)) {
                // Debug: total_supply ve max_supply kontrolü
                const sampleCoin = coins[0]
                const coinsWithTotalSupply = coins.filter(c => c.total_supply !== null && c.total_supply !== undefined).length
                const coinsWithMaxSupply = coins.filter(c => c.max_supply !== null && c.max_supply !== undefined).length
                
                cryptoList = coins
                cryptoApiStatuses.push({ name: 'MongoDB Cache', success: true })
                fromMongoDB = true
                logger.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${cryptoList.length} coin)`)
              } else {
                // MongoDB'den gelen veri daha eski veya aynı, mevcut veriyi koru (WebSocket öncelikli)
                logger.log(`⏭️ [${timeStr}] Crypto verisi atlandı (MongoDB'deki veri daha eski veya aynı, WebSocket öncelikli)`)
              }
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
          // KRİTİK: WebSocket'ten gelen veri her zaman öncelikli olmalı
          // Eğer mevcut veri varsa ve updateAllData() çalışıyorsa, WebSocket'ten gelen veri daha yeni olabilir
          // Bu yüzden sadece mevcut veri YOKSA veya updateAllData() başlamadan ÖNCE mevcut veri yoksa yükle
          // Ama WebSocket'ten gelen veri her zaman güncellenmeli
          
          // Eğer mevcut veri varsa, updateAllData() içinde yükleme yapma (WebSocket'ten gelen veri daha yeni olabilir)
          // Sadece mevcut veri YOKSA yükle
          if (this.coins.length === 0) {
            // Mevcut veri yoksa yükle
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil (eski cache geri dönmesin)
            localStorage.removeItem(this.CACHE_KEYS.crypto)
            
            const limitedList = cryptoList.length > 500 ? cryptoList.slice(0, 500) : cryptoList
            this.coins = limitedList
            this.topMovers = this.calculateTopMovers(limitedList)
            this.lastCryptoUpdate = new Date()
            results.crypto.success = true
            // localStorage'a hemen kaydet (yeni veriler geldiğinde)
            this.saveToLocalStorage()
            // Abonelere bildir (yeni veriler)
            this.notifySubscribers()
          } else {
            // Mevcut veri var, updateAllData() içinde yükleme yapma (WebSocket'ten gelen veri daha yeni olabilir)
            results.crypto.success = true // Başarılı say (veri zaten var)
          }
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
          // localStorage'a hemen kaydet (yeni veriler geldiğinde)
          this.saveToLocalStorage()
          // Abonelere bildir (yeni veriler)
          this.notifySubscribers()
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
          // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
          localStorage.removeItem(this.CACHE_KEYS.fearGreed)
          
          this.fearGreedIndex = fearGreedData
          results.fearGreed.success = true
          // localStorage'a hemen kaydet (yeni veriler geldiğinde)
          this.saveToLocalStorage()
          // Abonelere bildir (yeni veriler)
          this.notifySubscribers()
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
                // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
                localStorage.removeItem(this.CACHE_KEYS.trending)
                
                this.trendingCoins = updateResult.data.coins || []
                this.lastTrendingUpdate = updateResult.data.updatedAt || Date.now()
                results.trending.success = true
                results.trending.apiStatuses = [{ name: 'Trending Update (Homepage Coins)', success: true }]
                results.trending.duration = ((Date.now() - trendingStartTime) / 1000).toFixed(2)
                // localStorage'a hemen kaydet (yeni veriler geldiğinde)
                this.saveToLocalStorage()
                // Abonelere bildir (yeni veriler)
                this.notifySubscribers()
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
                // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
                localStorage.removeItem(this.CACHE_KEYS.trending)
                
                this.trendingCoins = trendingResult.data.coins || []
                this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
                results.trending.success = true
                results.trending.apiStatuses = [{ name: 'MongoDB Trending (Fallback)', success: true }]
                // localStorage'a hemen kaydet (yeni veriler geldiğinde)
                this.saveToLocalStorage()
                // Abonelere bildir (yeni veriler)
                this.notifySubscribers()
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
              // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
              localStorage.removeItem(this.CACHE_KEYS.trending)
              
              this.trendingCoins = trendingResult.data.coins || []
              this.lastTrendingUpdate = trendingResult.data.updatedAt || Date.now()
              results.trending.success = true
              results.trending.apiStatuses = [{ name: 'MongoDB Trending', success: true }]
              // localStorage'a hemen kaydet (yeni veriler geldiğinde)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
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
          // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
          localStorage.removeItem(this.CACHE_KEYS.currency)
          
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
          // localStorage'a hemen kaydet (yeni veriler geldiğinde)
          this.saveToLocalStorage()
          // Abonelere bildir (yeni veriler)
          this.notifySubscribers()
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
          // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
          localStorage.removeItem(this.CACHE_KEYS.fedRate)
          
          this.fedRateData = fedRateResult
          this.lastFedRateUpdate = Date.now()
          results.fedRate.success = true
          // localStorage'a hemen kaydet (yeni veriler geldiğinde)
          this.saveToLocalStorage()
          // Abonelere bildir (yeni veriler)
          this.notifySubscribers()
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
          // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
          localStorage.removeItem(this.CACHE_KEYS.supplyTracking)
          
          this.supplyTrackingData = supplyTrackingResult
          this.lastSupplyTrackingUpdate = Date.now()
          results.supplyTracking.success = true
          // localStorage'a hemen kaydet (yeni veriler geldiğinde)
          this.saveToLocalStorage()
          // Abonelere bildir (yeni veriler)
          this.notifySubscribers()
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
      // NOT: saveToLocalStorage() ve notifySubscribers() artık her veri güncellendiğinde çağrılıyor
      // Burada tekrar çağırmaya gerek yok - gereksiz kayıtları önlemek için
      // Sadece isUpdating durumunu güncelle
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
    
    // İlk başlatmada eski cache'leri temizle
    this.cleanupOldCache()
    
    // WebSocket ile real-time güncellemeleri dinle
    this.setupRealtimeListeners()
    
    // İlk başlatmada sadece MongoDB'den mevcut veriyi yükle (API çağrısı yapma)
    // Retry mekanizması ile backend hazır olana kadar dene - ANINDA YÜKLE
    // KRİTİK: Sadece mevcut veri YOKSA yükle (yeni veri geldikten sonra eski veriye dönme)
    if (this.coins.length === 0) {
      this.loadFromMongoDBOnlyWithRetry().catch(() => {
        // Hata olsa bile abonelere bildir
        this.notifySubscribers()
      })
    } else {
      // Mevcut veri varsa MongoDB'den yükleme (yeni veri zaten yüklenmiş)
      logger.log('⏭️ loadFromMongoDBOnlyWithRetry atlandı (mevcut veri var)')
    }
    
    // Recursive setTimeout kullanarak 5 dakikalık sabit zaman dilimlerinde güncelle
    const scheduleNextUpdate = () => {
      const delay = this.getNextUpdateTime()
      
      this.updateTimeout = setTimeout(() => {
        // Her güncellemede eski cache'leri temizle
        this.cleanupOldCache()
        this.updateAllData().catch(() => {})
        scheduleNextUpdate()
      }, delay)
    }
    
    scheduleNextUpdate()
    
    // Periyodik cache temizleme (her 1 saatte bir)
    if (typeof window !== 'undefined') {
      setInterval(() => {
        this.cleanupOldCache()
      }, 60 * 60 * 1000) // 1 saat
    }
  }
  
  // Sadece MongoDB'den mevcut veriyi yükle (API çağrısı yapmadan) - PARALEL YÜKLEME
  // KRİTİK: Bu fonksiyon sadece ilk yüklemede çağrılmalı, yeni veri geldikten sonra çağrılmamalı
  async loadFromMongoDBOnly() {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    
    // KRİTİK: Eğer mevcut veri varsa, MongoDB'den yükleme (yeni veri zaten yüklenmiş, eski veriye dönme)
    if (this.coins.length > 0) {
      logger.log(`⏭️ [${timeStr}] loadFromMongoDBOnly atlandı (mevcut veri var, eski veriye dönme)`)
      return // Mevcut veri varsa MongoDB'den yükleme
    }
    
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
              // KRİTİK: Sadece mevcut veri YOKSA yükle (yeni veri geldikten sonra eski veriye dönme)
              // Eğer mevcut veri varsa, MongoDB'den yükleme (yeni veri zaten yüklenmiş)
              if (this.coins.length === 0) {
                // Mevcut veri yoksa MongoDB'den yükle
                // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
                localStorage.removeItem(this.CACHE_KEYS.crypto)
                
                this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
                this.topMovers = this.calculateTopMovers(this.coins)
                this.lastCryptoUpdate = new Date(mongoResult.data.lastUpdate || Date.now())
                // localStorage'a kaydet (yeni veriler)
                this.saveToLocalStorage()
                // Abonelere bildir (yeni veriler)
                this.notifySubscribers()
                logger.log(`✅ [${timeStr}] Crypto verisi MongoDB'den yüklendi (${this.coins.length} coin)`)
              } else {
                // Mevcut veri varsa MongoDB'den yükleme (yeni veri zaten yüklenmiş, eski veriye dönme)
                logger.log(`⏭️ [${timeStr}] Crypto verisi atlandı (mevcut veri var, eski veriye dönme)`)
              }
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
            // Timestamp kontrolü: Sadece mevcut verilerden daha yeni veya mevcut veri yoksa yükle
            const newTimestamp = mongoResult.data.lastUpdate || Date.now()
            const currentTimestamp = this.lastDominanceUpdate || 0
            
            if (newTimestamp >= currentTimestamp || !this.dominanceData) {
              this.dominanceData = mongoResult.data
              this.lastDominanceUpdate = newTimestamp
              // localStorage'a kaydet (yeni veriler)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
              logger.log(`✅ [${timeStr}] Dominance verisi MongoDB'den yüklendi`)
            }
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
            // Fear & Greed için timestamp kontrolü yok (tek bir değer), direkt yükle
            this.fearGreedIndex = mongoResult.data
            // localStorage'a kaydet (yeni veriler)
            this.saveToLocalStorage()
            // Abonelere bildir (yeni veriler)
            this.notifySubscribers()
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
            // Timestamp kontrolü: Sadece mevcut verilerden daha yeni veya mevcut veri yoksa yükle
            const newTimestamp = trendingResult.data.updatedAt || Date.now()
            const currentTimestamp = this.lastTrendingUpdate || 0
            
            if (newTimestamp >= currentTimestamp || this.trendingCoins.length === 0) {
              this.trendingCoins = trendingResult.data.coins || []
              this.lastTrendingUpdate = newTimestamp
              // localStorage'a kaydet (yeni veriler)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
              logger.log(`✅ [${timeStr}] Trending verisi MongoDB'den yüklendi (${this.trendingCoins.length} coin)`)
            }
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
            // Timestamp kontrolü: Sadece mevcut verilerden daha yeni veya mevcut veri yoksa yükle
            const newTimestamp = mongoResult.updatedAt || Date.now()
            const currentTimestamp = this.lastCurrencyUpdate || 0
            
            if (newTimestamp >= currentTimestamp || !this.currencyRates) {
              this.currencyRates = mongoResult.data
              this.lastCurrencyUpdate = newTimestamp
              if (typeof window !== 'undefined') {
                window.__exchangeRates = this.currencyRates
              }
              // localStorage'a kaydet (yeni veriler)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
              logger.log(`✅ [${timeStr}] Currency rates MongoDB'den yüklendi`)
            }
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
              // Timestamp kontrolü: Sadece mevcut verilerden daha yeni veya mevcut veri yoksa yükle
              const newTimestamp = mongoResult.data.lastUpdate || Date.now()
              const currentTimestamp = this.lastFedRateUpdate || 0
              
              if (newTimestamp >= currentTimestamp || !this.fedRateData) {
                this.fedRateData = mongoResult.data
                this.lastFedRateUpdate = newTimestamp
                // localStorage'a kaydet (yeni veriler)
                this.saveToLocalStorage()
                // Abonelere bildir (yeni veriler)
                this.notifySubscribers()
                logger.log(`✅ [${timeStr}] Fed Rate verisi MongoDB'den yüklendi`)
              }
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
            // Timestamp kontrolü: Sadece mevcut verilerden daha yeni veya mevcut veri yoksa yükle
            const newTimestamp = mongoResult.data.lastUpdate || Date.now()
            const currentTimestamp = this.lastSupplyTrackingUpdate || 0
            
            if (newTimestamp >= currentTimestamp || !this.supplyTrackingData) {
              this.supplyTrackingData = mongoResult.data.data || mongoResult.data
              this.lastSupplyTrackingUpdate = newTimestamp
              // localStorage'a kaydet (yeni veriler)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
              logger.log(`✅ [${timeStr}] Supply Tracking verisi MongoDB'den yüklendi`)
            }
          }
        } catch (e) {
          // Sessizce geç
        }
      }
      
      // NOT: saveToLocalStorage() ve notifySubscribers() artık her veri güncellendiğinde çağrılıyor
      // Burada tekrar çağırmaya gerek yok - gereksiz kayıtları önlemek için
      // Sadece son durumu bildir (isUpdating durumu için)
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
          // KRİTİK: WebSocket'ten gelen veri formatı: fullDocument.data.coins veya fullDocument.coins
          const coins = data?.data?.coins || data?.coins || data || []
          if (Array.isArray(coins) && coins.length > 0) {
            // KRİTİK: Veri gerçekten değişti mi kontrol et (gereksiz güncellemeleri önle)
            // İlk coin'in ID'si ve fiyatını karşılaştır
            const newFirstCoin = coins[0]
            const currentFirstCoin = this.coins[0]
            
            // Eğer veri gerçekten değiştiyse güncelle
            const dataChanged = !currentFirstCoin || 
                               currentFirstCoin.id !== newFirstCoin.id || 
                               currentFirstCoin.current_price !== newFirstCoin.current_price ||
                               this.coins.length !== coins.length
            
            if (dataChanged) {
              // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil (eski cache geri dönmesin)
              localStorage.removeItem(this.CACHE_KEYS.crypto)
              
              // KRİTİK: WebSocket'ten gelen veri her zaman öncelikli - her zaman güncelle
              // updateAllData() içinde MongoDB'den veri çekilirken, WebSocket'ten gelen yeni veri üzerine yazılmamalı
              // Bu yüzden WebSocket'ten gelen veri her zaman güncellenmeli
              // WebSocket'ten gelen veri her zaman daha yeni, çünkü backend'deki memory cache güncellendiğinde WebSocket'ten bildirim geliyor
              
              this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
              this.topMovers = this.calculateTopMovers(this.coins)
              this.lastCryptoUpdate = new Date()
              // localStorage'a kaydet (yeni veriler geldiğinde)
              this.saveToLocalStorage()
              // Abonelere bildir (yeni veriler)
              this.notifySubscribers()
            } else {
              // Veri değişmedi, gereksiz güncelleme yapma
            }
          }
        }
        
        // Dominance data güncellemesi
        if (documentId === 'dominance_data') {
          if (data) {
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.dominance)
            
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
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.fearGreed)
            
            this.fearGreedIndex = data
            // localStorage'a kaydet
            this.saveToLocalStorage()
            this.notifySubscribers()
          }
        }
        
        // Currency rates güncellemesi
        if (documentId === 'currency_rates') {
          if (data) {
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.currency)
            
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
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.fedRate)
            
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
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.supplyTracking)
            
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
            // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
            localStorage.removeItem(this.CACHE_KEYS.trending)
            
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
    // NOT: WebSocket zaten aynı işi yapıyor, bu yüzden Custom event'ler sadece fallback olarak kullanılmalı
    // KRİTİK: Custom event'ler WebSocket'ten önce tetiklenebilir ve eski veriyi yükleyebilir
    // Bu yüzden Custom event handler'ında timestamp kontrolü yapmalıyız
    if (typeof window !== 'undefined') {
      const handleCryptoUpdate = (event) => {
        const { documentId, data } = event.detail || {}
        if (documentId === 'crypto_list' && data && data.coins) {
          const coins = Array.isArray(data.coins) ? data.coins : []
          if (coins.length > 0) {
            // KRİTİK: Veri gerçekten değişti mi kontrol et (gereksiz güncellemeleri önle)
            // İlk coin'in ID'si ve fiyatını karşılaştır
            const newFirstCoin = coins[0]
            const currentFirstCoin = this.coins[0]
            
            // KRİTİK: Custom event'ler WebSocket'ten önce tetiklenebilir ve eski veriyi yükleyebilir
            // Bu yüzden sadece mevcut veri YOKSA veya yeni veri kesinlikle daha yeni ise güncelle
            // WebSocket'ten gelen veri her zaman öncelikli olmalı
            
            // Eğer mevcut veri varsa, Custom event'ten yükleme yapma (WebSocket öncelikli)
            if (this.coins.length === 0) {
              // Mevcut veri yoksa Custom event'ten yükle (fallback)
              // YENİ VERİ GELDİĞİNDE: Eski localStorage cache'i sil
              localStorage.removeItem(this.CACHE_KEYS.crypto)
              
              this.coins = coins.length > 500 ? coins.slice(0, 500) : coins
              this.topMovers = this.calculateTopMovers(this.coins)
              this.lastCryptoUpdate = new Date()
              // localStorage'a kaydet
              this.saveToLocalStorage()
              this.notifySubscribers()
              console.log('✅ Custom event: Crypto verisi güncellendi (fallback):', this.coins.length, 'coin, BTC price:', newFirstCoin?.current_price)
            } else {
              // Mevcut veri var, Custom event'ten yükleme yapma (WebSocket öncelikli)
              console.log('⏭️ Custom event: Crypto verisi atlandı (mevcut veri var, WebSocket öncelikli)')
            }
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
