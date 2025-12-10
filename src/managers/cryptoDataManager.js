// Merkezi Kripto Veri Yönetim Sistemi
// Tüm sayfalar için veri çekme ve güncelleme işlemlerini yönetir

import cryptoService from '../services/cryptoService'

class CryptoDataManager {
  constructor() {
    this.coins = []
    this.topMovers = { topGainers: [], topLosers: [] }
    this.lastUpdate = null
    this.updateInterval = null
    this.subscribers = new Set()
    this.isUpdating = false
    this.updateIntervalMs = 5 * 60 * 1000 // 5 dakika
  }

  // Abone ol (sayfalar veri değişikliklerini dinleyebilir)
  subscribe(callback) {
    this.subscribers.add(callback)
    // Mevcut veriyi hemen gönder
    callback({
      coins: this.coins,
      topMovers: this.topMovers,
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
      coins: this.coins,
      topMovers: this.topMovers,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    }

    this.subscribers.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error('Error notifying subscriber:', error)
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
      image: coin.image || `https://assets.coingecko.com/coins/images/${coin.id}/small/${coin.id}.png`,
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

    console.log(`\n📊 [${timeStr}] ========== Crypto Veri Güncelleme Başladı ==========`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

    const results = { success: false, duration: 0, apiStatuses: [], source: null }

    try {
      const result = await cryptoService.fetchCryptoListWithStatus()
      const cryptoList = result.data || []
      const apiStatus = result.apiStatus || {}

      // API durumlarını kaydet
      if (apiStatus.apiStatuses && Array.isArray(apiStatus.apiStatuses)) {
        results.apiStatuses = apiStatus.apiStatuses
        results.source = apiStatus.source || 'API'
      } else if (apiStatus.source) {
        // Tek bir API çağrısı varsa (cache gibi)
        results.apiStatuses = [{ name: apiStatus.source, success: apiStatus.success || false }]
        results.source = apiStatus.source
      }

      if (cryptoList && cryptoList.length > 0) {
        // Kesinlikle 300 coin
        const limitedList = cryptoList.length > 300 ? cryptoList.slice(0, 300) : cryptoList

        this.coins = limitedList
        this.topMovers = this.calculateTopMovers(limitedList)
        this.lastUpdate = new Date()

        results.success = true
        results.duration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      } else {
        results.duration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      }
    } catch (error) {
      results.duration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      // Hata durumunda API durumlarını kontrol et
      if (error.apiStatus) {
        results.apiStatuses = error.apiStatus.apiStatuses || []
        results.source = error.apiStatus.source || 'Error'
      }
    } finally {
      const totalDuration = ((Date.now() - updateStartTime) / 1000).toFixed(2)
      console.log(`\n📊 [${timeStr}] ========== Crypto Veri Güncelleme Tamamlandı ==========`)
      console.log(`⏱️  [${timeStr}] Toplam süre: ${totalDuration}s`)
      console.log(`📈 [${timeStr}] Crypto: ${results.success ? '✅ Başarılı' : '❌ Başarısız'} (${results.duration}s)`)

      // API durumlarını göster
      if (results.apiStatuses && results.apiStatuses.length > 0) {
        results.apiStatuses.forEach(status => {
          const icon = status.success ? '✅' : '❌'
          const errorText = status.error ? ` - ${status.error}` : ''
          console.log(`   ${icon} ${status.name}${errorText}`)
        })
      } else {
        // API durumu yoksa, genel durumu göster
        if (results.source) {
          console.log(`   ${results.success ? '✅' : '❌'} ${results.source}`)
        } else {
          console.log(`   ${results.success ? '✅' : '❌'} Veri kaynağı: Bilinmiyor`)
        }
      }

      console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
      console.log(`═══════════════════════════════════════════════════════════\n`)

      this.isUpdating = false
      this.notifySubscribers()
    }
  }

  // Sonraki güncelleme zamanını hesapla (5 dakikanın katları: 00:00, 00:05, 00:10, vb.)
  getNextUpdateTime() {
    const now = new Date()
    const currentMinutes = now.getMinutes()

    // Şu anki dakikanın hangi 5 dakikalık dilimde olduğunu bul
    const currentSlot = Math.floor(currentMinutes / 5)
    const nextSlot = currentSlot + 1

    // Sonraki 5 dakikalık zamanı hesapla
    const nextTime = new Date(now)

    if (nextSlot * 5 >= 60) {
      // Bir sonraki saate geç
      nextTime.setHours(now.getHours() + 1)
      nextTime.setMinutes(0)
    } else {
      // Aynı saat içinde, sonraki 5 dakikalık dilime geç
      nextTime.setMinutes(nextSlot * 5)
    }

    nextTime.setSeconds(0)
    nextTime.setMilliseconds(0)

    // Şu anki zamandan sonraki zamana kadar geçen süreyi hesapla
    const delay = nextTime.getTime() - now.getTime()

    // Eğer delay çok küçükse (zaten o zaman dilimindeysek), bir sonraki 5 dakikaya geç
    if (delay < 1000) {
      nextTime.setMinutes(nextTime.getMinutes() + 5)
      return nextTime.getTime() - now.getTime()
    }

    return delay
  }

  // Otomatik güncelleme başlat
  startAutoUpdate() {
    // İlk güncellemeyi hemen yap
    this.updateData()

    // Recursive setTimeout kullanarak 5 dakikalık zaman dilimlerinde güncelle
    const scheduleNextUpdate = () => {
      const delay = this.getNextUpdateTime()

      const timeoutId = setTimeout(() => {
        this.updateData()
        // Her güncellemeden sonra bir sonraki zamanı planla
        scheduleNextUpdate()
      }, delay)

      // Timeout ID'yi sakla (cleanup için)
      this.updateInterval = timeoutId
    }

    scheduleNextUpdate()
  }

  // Otomatik güncellemeyi durdur
  stopAutoUpdate() {
    if (this.updateInterval) {
      clearTimeout(this.updateInterval)
      this.updateInterval = null
    }
  }

  // Manuel güncelleme
  async refresh() {
    await this.updateData()
  }

  // Mevcut veriyi al
  getData() {
    return {
      coins: this.coins,
      topMovers: this.topMovers,
      lastUpdate: this.lastUpdate,
      isUpdating: this.isUpdating
    }
  }
}

// Singleton instance
const cryptoDataManager = new CryptoDataManager()

export default cryptoDataManager

