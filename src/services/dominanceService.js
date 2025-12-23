/**
 * Dominance Service
 * Dominance verilerini yöneten servis (BaseService'ten kalıtım alır)
 * OOP prensiplerine uygun şekilde refactor edildi
 */
import BaseService from '../core/BaseService.js'
import firestoreCacheService from './firestoreCacheService'

class DominanceService extends BaseService {
  /**
   * Constructor
   */
  constructor() {
    super('Hakimiyet Verileri') // BaseService constructor'ını çağır

    this.CACHE_KEY = 'dominance_data_cache'
    this.CACHE_TIME_KEY = 'dominance_data_cache_time'
    this.CACHE_DURATION = 5 * 60 * 1000 // 5 dakika
  }

  /**
   * Merkezi güncelleme için (BaseService'ten override)
   */
  async update() {
    // Cache kontrolü
    const cached = this.getCachedData()
    if (cached) {
      // Cache geçerli, güncelleme yapma
      return cached
    }

    // Cache eski veya yok - yeni veri çek
    await this.fetchDominanceData()
  }

  /**
   * Cache'den dominance verilerini al (localStorage fallback)
   */
  getCachedData() {
    try {
      const cachedData = localStorage.getItem(this.CACHE_KEY)
      const cacheTime = localStorage.getItem(this.CACHE_TIME_KEY)

      if (cachedData && cacheTime) {
        const age = Date.now() - parseInt(cacheTime)
        if (age < this.CACHE_DURATION) {
          return JSON.parse(cachedData)
        }
      }

      // localStorage'da yoksa BaseService cache'inden dene
      const memoryCache = super.getCache(this.CACHE_KEY)
      if (memoryCache) {
        return memoryCache
      }

      return null
    } catch (error) {
      return null
    }
  }

  /**
   * Dominance verilerini cache'e kaydet (localStorage + BaseService cache)
   */
  setCachedData(data) {
    try {
      // LocalStorage'a kaydet (fallback için)
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data))
      localStorage.setItem(this.CACHE_TIME_KEY, Date.now().toString())

      // BaseService cache'ine de kaydet
      super.setCache(this.CACHE_KEY, data, this.CACHE_DURATION)
    } catch (error) {
      // Cache yazma hatası - sessiz devam et
    }
  }

  /**
   * Dominance verilerini çek
   * NOT: Artık sadece MongoDB'den çeker, direkt API çağrısı yapmaz
   * API çağrıları backend scheduler tarafından yapılıyor
   */
  async fetchDominanceData(retryCount = 0, forceUpdate = false) {
    const apiStatuses = []
    try {
      // Sadece MongoDB'den çek (backend scheduler zaten güncelliyor)
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)

      if (mongoResponse.ok) {
        const mongoResult = await mongoResponse.json()
        if (mongoResult.success && mongoResult.data) {
          apiStatuses.push({ name: 'MongoDB Dominance', success: true })
          return { data: mongoResult.data, apiStatuses }
        }
      }

      // MongoDB'de veri yoksa, backend scheduler'ın güncellemesini bekle
      apiStatuses.push({ name: 'Backend Scheduler', success: true, message: 'Veri backend scheduler tarafından güncellenecek' })

      // Cache'den fallback yap - SADECE gerçek veri varsa
      const cached = this.getCachedData()
      if (cached && cached.global && cached.dominanceData && cached.dominanceData.length > 0) {
        // Cache'deki verinin geçerli olduğunu kontrol et
        const btcDom = cached.dominanceData.find(d => d.name === 'BTC')?.value
        const ethDom = cached.dominanceData.find(d => d.name === 'ETH')?.value
        if (btcDom !== undefined && btcDom !== null && !isNaN(btcDom) &&
          ethDom !== undefined && ethDom !== null && !isNaN(ethDom) &&
          cached.global.total_market_cap?.usd && cached.global.total_volume?.usd) {
          window.dispatchEvent(new CustomEvent('dominanceDataUpdated', { detail: cached }))
          return { data: cached, apiStatuses: [{ name: 'Cache Fallback', success: true }] }
        }
      }

      return { data: null, apiStatuses }
    } catch (error) {
      // Cache'den fallback yap - SADECE gerçek veri varsa
      const cached = this.getCachedData()
      if (cached && cached.global && cached.dominanceData && cached.dominanceData.length > 0) {
        // Cache'deki verinin geçerli olduğunu kontrol et
        const btcDom = cached.dominanceData.find(d => d.name === 'BTC')?.value
        const ethDom = cached.dominanceData.find(d => d.name === 'ETH')?.value
        if (btcDom !== undefined && btcDom !== null && !isNaN(btcDom) &&
          ethDom !== undefined && ethDom !== null && !isNaN(ethDom) &&
          cached.global.total_market_cap?.usd && cached.global.total_volume?.usd) {
          window.dispatchEvent(new CustomEvent('dominanceDataUpdated', { detail: cached }))
          return { data: cached, apiStatuses: [{ name: 'Cache Fallback', success: true }] }
        }
      }

      return { data: null, apiStatuses: [{ name: 'Error', success: false, error: error.message }] }
    }
  }

  /**
   * Historical data'yı localStorage'dan al
   */
  getHistoricalData() {
    try {
      const stored = localStorage.getItem('dominance_historical_data')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      // Sessiz devam et
    }
    return []
  }

  // Eski kod - artık kullanılmıyor (backend scheduler tarafından yapılıyor)
  async fetchDominanceData_OLD() {
    const apiStatuses = []
    try {
      const COINGECKO_API = 'https://api.coingecko.com/api/v3'

      // 1) Global metrics çek (BTC/ETH dominance, market cap, volume)
      let global = null
      try {
        const globalResponse = await fetch(`${COINGECKO_API}/global`, {
          headers: { 'Accept': 'application/json' }
        })

        if (globalResponse.ok) {
          const globalData = await globalResponse.json()
          global = globalData.data
          apiStatuses.push({ name: 'CoinGecko Global', success: true })
        } else {
          apiStatuses.push({ name: 'CoinGecko Global', success: false, error: `HTTP ${globalResponse.status}` })
          throw new Error(`CoinGecko Global API error: ${globalResponse.status}`)
        }
      } catch (error) {
        apiStatuses.push({ name: 'CoinGecko Global', success: false, error: error.message })
        throw error
      }

      // 2) Top 100 coins çek (volume data için)
      let coinsData = []
      try {
        const coinsResponse = await fetch(
          `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false`,
          { headers: { 'Accept': 'application/json' } }
        )

        if (coinsResponse.ok) {
          coinsData = await coinsResponse.json()
          apiStatuses.push({ name: 'CoinGecko Coins', success: true })
        } else {
          apiStatuses.push({ name: 'CoinGecko Coins', success: false, error: `HTTP ${coinsResponse.status}` })
          throw new Error(`CoinGecko Coins API error: ${coinsResponse.status}`)
        }
      } catch (error) {
        apiStatuses.push({ name: 'CoinGecko Coins', success: false, error: error.message })
        throw error
      }

      // 3) Veriyi işle ve formatla - Gerçek veri kontrolü
      const btcDominance = global.market_cap_percentage?.btc
      const ethDominance = global.market_cap_percentage?.eth

      // Veri yoksa hata fırlat
      if (btcDominance === undefined || btcDominance === null || isNaN(btcDominance)) {
        throw new Error('Bitcoin dominance verisi alınamadı')
      }
      if (ethDominance === undefined || ethDominance === null || isNaN(ethDominance)) {
        throw new Error('Ethereum dominance verisi alınamadı')
      }

      const othersDominance = 100 - btcDominance - ethDominance

      // Dominance data
      const dominanceData = [
        {
          name: 'BTC',
          value: btcDominance,
          color: '#f7931a',
          change: 0 // CoinGecko'da 24h change yok, hesaplanabilir
        },
        {
          name: 'ETH',
          value: ethDominance,
          color: '#627eea',
          change: 0
        },
        {
          name: 'Others',
          value: othersDominance,
          color: '#6b7280',
          change: 0
        }
      ]

      // Volume data (top 5 coin) - Gerçek veri kontrolü
      const totalVolume = global.total_volume?.usd
      if (totalVolume === undefined || totalVolume === null || isNaN(totalVolume) || totalVolume === 0) {
        throw new Error('Toplam hacim verisi alınamadı')
      }

      const volumeData = coinsData
        .slice(0, 5)
        .map(coin => ({
          name: coin.symbol.toUpperCase(),
          volume: coin.total_volume !== undefined && coin.total_volume !== null ? coin.total_volume : 0,
          dominance: coin.total_volume !== undefined && coin.total_volume !== null
            ? ((coin.total_volume / totalVolume) * 100)
            : 0,
          image: coin.image,
          change: coin.price_change_percentage_24h !== undefined && coin.price_change_percentage_24h !== null
            ? coin.price_change_percentage_24h
            : 0
        }))

      // Top 3 coins - Gerçek veri kontrolü
      const top3Coins = coinsData.slice(0, 3).map(coin => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        total_volume: coin.total_volume !== undefined && coin.total_volume !== null ? coin.total_volume : 0,
        market_cap: coin.market_cap !== undefined && coin.market_cap !== null ? coin.market_cap : 0,
        price_change_percentage_24h: coin.price_change_percentage_24h !== undefined && coin.price_change_percentage_24h !== null
          ? coin.price_change_percentage_24h
          : 0
      }))

      // Dominance table data - Gerçek veri kontrolü
      const totalMarketCap = global.total_market_cap?.usd
      if (totalMarketCap === undefined || totalMarketCap === null || isNaN(totalMarketCap) || totalMarketCap === 0) {
        throw new Error('Toplam piyasa değeri verisi alınamadı')
      }

      const dominanceTableData = coinsData.slice(0, 10).map(coin => ({
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        dominance: coin.market_cap !== undefined && coin.market_cap !== null
          ? ((coin.market_cap / totalMarketCap) * 100)
          : 0,
        marketCap: coin.market_cap !== undefined && coin.market_cap !== null ? coin.market_cap : 0,
        volume: coin.total_volume !== undefined && coin.total_volume !== null ? coin.total_volume : 0,
        change: coin.price_change_percentage_24h !== undefined && coin.price_change_percentage_24h !== null
          ? coin.price_change_percentage_24h
          : 0
      }))

      // Historical data (son 7 gün) - Önce MongoDB'den TAM VERİYİ çek (historicalData dahil)
      let historicalData = []
      try {
        const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
        const mongoResponse = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)
        if (mongoResponse.ok) {
          const mongoResult = await mongoResponse.json()
          if (mongoResult.success && mongoResult.data && mongoResult.data.historicalData) {
            historicalData = mongoResult.data.historicalData
            apiStatuses.push({ name: 'MongoDB Historical', success: true })
          } else {
            apiStatuses.push({ name: 'MongoDB Historical', success: false, error: 'No historical data' })
          }
        } else {
          apiStatuses.push({ name: 'MongoDB Historical', success: false, error: `HTTP ${mongoResponse.status}` })
        }
      } catch (error) {
        apiStatuses.push({ name: 'MongoDB Historical', success: false, error: error.message })
      }

      // Eğer MongoDB'de yoksa, localStorage'dan çek
      if (!historicalData || historicalData.length === 0) {
        historicalData = this.getHistoricalData() || []
        if (historicalData.length > 0) {
          apiStatuses.push({ name: 'localStorage Historical', success: true })
        }
      }

      // Final data structure
      const data = {
        dominanceData,
        volumeData,
        historicalData,
        global: {
          total_market_cap: {
            usd: global.total_market_cap?.usd !== undefined && global.total_market_cap?.usd !== null
              ? global.total_market_cap.usd
              : 0
          },
          total_volume: {
            usd: global.total_volume?.usd !== undefined && global.total_volume?.usd !== null
              ? global.total_volume.usd
              : 0
          },
          btc_dominance: btcDominance,
          eth_dominance: ethDominance,
          active_cryptocurrencies: global.active_cryptocurrencies !== undefined && global.active_cryptocurrencies !== null
            ? global.active_cryptocurrencies
            : 0,
          active_exchanges: global.markets !== undefined && global.markets !== null
            ? global.markets
            : 0
        },
        top3Coins,
        dominanceTableData,
        lastUpdate: Date.now()
      }

      // Historical data'yı güncelle (bugünün snapshot'ını ekle) - ÖNCE güncelle, SONRA döndür
      await this.updateHistoricalData(data)

      // Historical data güncellendikten sonra data'yı güncelle
      data.historicalData = data.historicalData || []

      // Cache'e kaydet
      this.setCachedData(data)

      // Event dispatch
      window.dispatchEvent(new CustomEvent('dominanceDataUpdated', { detail: data }))

      return { data, apiStatuses }

    } catch (error) {
      // Cache'den fallback yap - SADECE gerçek veri varsa
      const cached = this.getCachedData()
      if (cached && cached.global && cached.dominanceData && cached.dominanceData.length > 0) {
        // Cache'deki verinin geçerli olduğunu kontrol et
        const btcDom = cached.dominanceData.find(d => d.name === 'BTC')?.value
        const ethDom = cached.dominanceData.find(d => d.name === 'ETH')?.value
        if (btcDom !== undefined && btcDom !== null && !isNaN(btcDom) &&
          ethDom !== undefined && ethDom !== null && !isNaN(ethDom) &&
          cached.global.total_market_cap?.usd && cached.global.total_volume?.usd) {
          window.dispatchEvent(new CustomEvent('dominanceDataUpdated', { detail: cached }))
          return { data: cached, apiStatuses: [{ name: 'Cache Fallback', success: true }] }
        }
      }

      // Cache'de geçerli veri yoksa hata fırlat
      throw { error: error.message || error, apiStatuses }
    }
  }

  /**
   * Historical data'yı localStorage'dan al
   */
  getHistoricalData() {
    try {
      const stored = localStorage.getItem('dominance_historical_data')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      // Sessiz devam et
    }
    return []
  }

  /**
   * Historical data'yı MongoDB'den çek
   */
  async loadHistoricalDataFromMongo() {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
      const response = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data && result.data.historicalData) {
          return result.data.historicalData
        }
      }
    } catch (error) {
      // Sessiz devam et
    }
    return null
  }

  /**
   * Historical data'yı MongoDB'ye kaydet
   */
  async saveHistoricalDataToMongo(historicalData) {
    try {
      const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'

      // Önce mevcut dominance data'yı çek
      const getResponse = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`)
      let existingData = {}

      if (getResponse.ok) {
        const getResult = await getResponse.json()
        if (getResult.success && getResult.data) {
          existingData = getResult.data
        }
      }

      // Historical data'yı ekle ve kaydet
      const response = await fetch(`${MONGO_API_URL}/api/cache/dominance_data`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...existingData,
          historicalData
        })
      })

      if (response.ok) {
        return true
      }
    } catch (error) {
      // Sessiz devam et
    }
    return false
  }

  /**
   * Historical data'yı güncelle (bugünün snapshot'ını ekle, son 7 günü tut)
   * MongoDB'deki mevcut historicalData'yı KORUR ve sadece bugünün verisini ekler/günceller
   */
  async updateHistoricalData(currentData) {
    try {
      const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

      // Önce MongoDB'den historical data'yı çek (7 günlük veri burada)
      let historical = await this.loadHistoricalDataFromMongo()

      // Eğer MongoDB'de yoksa, localStorage'dan çek
      if (!historical || historical.length === 0) {
        historical = this.getHistoricalData()
      }

      // Eğer currentData'da zaten historicalData varsa (MongoDB'den gelmiş), onu kullan
      if (currentData.historicalData && currentData.historicalData.length > 0) {
        historical = currentData.historicalData
      }

      // Bugünün snapshot'ını ekle/güncelle
      const todayIndex = historical.findIndex(h => h.date === today)
      const snapshot = {
        date: today,
        coin1: currentData.dominanceData[0]?.value || 0, // BTC
        coin2: currentData.dominanceData[1]?.value || 0, // ETH
        others: currentData.dominanceData[2]?.value || 0
      }

      if (todayIndex >= 0) {
        historical[todayIndex] = snapshot
      } else {
        historical.push(snapshot)
      }

      // Son 7 günü tut (eski günleri sil)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const filtered = historical.filter(h => {
        const hDate = new Date(h.date)
        return hDate >= sevenDaysAgo
      })

      // Tarihe göre sırala
      filtered.sort((a, b) => new Date(a.date) - new Date(b.date))

      // localStorage'a kaydet (fallback)
      localStorage.setItem('dominance_historical_data', JSON.stringify(filtered))

      // MongoDB'ye kaydet (mevcut veri ile birleştirilmiş şekilde)
      await this.saveHistoricalDataToMongo(filtered)

      // Current data'yı güncelle
      currentData.historicalData = filtered
    } catch (error) {
      // Sessiz devam et
    }
  }


  /**
   * NOT: start() ve stop() metodları kaldırıldı
   * Veri çekme işlemleri artık DominanceDataManager tarafından yönetiliyor
   * Bu servis sadece veri çekme işlemini yapar
   */
}

// Singleton instance
const dominanceServiceInstance = new DominanceService()

export default dominanceServiceInstance

