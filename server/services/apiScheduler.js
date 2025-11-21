const PORT = process.env.PORT || 3000
const getMongoApiUrl = () => {
  // Environment variable varsa onu kullan
  if (process.env.MONGO_API_URL) {
    return process.env.MONGO_API_URL
  }
  // Production'da (Heroku) localhost kullan (aynı server)
  if (process.env.NODE_ENV === 'production') {
    return `http://localhost:${PORT}`
  }
  // Development'ta localhost
  return `http://localhost:${PORT}`
}
const MONGO_API_URL = getMongoApiUrl()

let schedulerInterval = null
let isRunning = false

function getNextUpdateTime(intervalMinutes = 5) {
  const now = new Date()
  const currentMinutes = now.getMinutes()
  
  const currentSlot = Math.floor(currentMinutes / intervalMinutes)
  const nextSlot = currentSlot + 1
  
  const nextUpdate = new Date(now)
  
  if (nextSlot * intervalMinutes >= 60) {
    nextUpdate.setHours(now.getHours() + 1)
    nextUpdate.setMinutes(0)
  } else {
    nextUpdate.setMinutes(nextSlot * intervalMinutes)
  }
  
  nextUpdate.setSeconds(0)
  nextUpdate.setMilliseconds(0)
  
  let delay = nextUpdate.getTime() - now.getTime()
  
  if (delay < 1000) {
    nextUpdate.setMinutes(nextUpdate.getMinutes() + intervalMinutes)
    delay = nextUpdate.getTime() - now.getTime()
  }
  
  return delay
}

/**
 * Dominance verilerini güncelle
 */
async function updateDominance() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/dominance/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Dominance verisi güncellendi (CoinMarketCap)`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Dominance güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Dominance güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Fear & Greed verilerini güncelle
 */
async function updateFearGreed() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/fear-greed/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Fear & Greed verisi güncellendi (CoinStats)`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Fear & Greed güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Fear & Greed güncelleme hatası:`, error.message)
    return false
  }
}

// Fear & Greed için ayrı scheduler
let fearGreedSchedulerInterval = null
let fearGreedIsRunning = false

// News için ayrı scheduler
let newsSchedulerInterval = null
let newsIsRunning = false

// Trending model tahminleri için ayrı scheduler (30 dakikada bir)
let trendingModelSchedulerInterval = null
let trendingModelIsRunning = false

/**
 * Fear & Greed verilerini güncelle (10 dakikada bir)
 */
async function updateFearGreedScheduled() {
  if (fearGreedIsRunning) {
    return
  }

  fearGreedIsRunning = true
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  const nextUpdateTime = new Date(Date.now() + getNextUpdateTime(10)).toLocaleTimeString('tr-TR')
  
  console.log(`\n😱 [${timeStr}] ========== Fear & Greed Güncelleme Başladı ==========`)
  console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

  const startTime = Date.now()

  try {
    const success = await updateFearGreed()
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n😱 [${timeStr}] ========== Fear & Greed Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`😱 [${timeStr}] Fear & Greed: ${success ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
    console.log(`═══════════════════════════════════════════════════════════\n`)
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\n❌ [${timeStr}] ========== Fear & Greed Güncelleme Hatası ==========`)
    console.error(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.error(`❌ [${timeStr}] Hata:`, error.message || error)
    console.error(`═══════════════════════════════════════════════════════════\n`)
  } finally {
    fearGreedIsRunning = false
    scheduleFearGreedNext()
  }
}

/**
 * Fear & Greed için sonraki güncellemeyi planla (10 dakika)
 */
function scheduleFearGreedNext() {
  if (fearGreedSchedulerInterval) {
    clearTimeout(fearGreedSchedulerInterval)
  }

  const delay = getNextUpdateTime(10) // 10 dakika
  fearGreedSchedulerInterval = setTimeout(() => {
    updateFearGreedScheduled()
  }, delay)
}

/**
 * News verilerini güncelle (10 dakikada bir)
 */
async function updateNewsScheduled() {
  if (newsIsRunning) {
    return
  }

  newsIsRunning = true
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  const nextUpdateTime = new Date(Date.now() + getNextUpdateTime(10)).toLocaleTimeString('tr-TR')
  
  console.log(`\n📰 [${timeStr}] ========== News Güncelleme Başladı ==========`)
  console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

  const startTime = Date.now()

  try {
    const success = await updateNews()
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n📰 [${timeStr}] ========== News Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`📰 [${timeStr}] News: ${success ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
    console.log(`═══════════════════════════════════════════════════════════\n`)
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\n❌ [${timeStr}] ========== News Güncelleme Hatası ==========`)
    console.error(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.error(`❌ [${timeStr}] Hata:`, error.message || error)
    console.error(`═══════════════════════════════════════════════════════════\n`)
  } finally {
    newsIsRunning = false
    scheduleNewsNext()
  }
}

/**
 * News için sonraki güncellemeyi planla (10 dakika)
 */
function scheduleNewsNext() {
  if (newsSchedulerInterval) {
    clearTimeout(newsSchedulerInterval)
  }

  const delay = getNextUpdateTime(10) // 10 dakika
  newsSchedulerInterval = setTimeout(() => {
    updateNewsScheduled()
  }, delay)
}

/**
 * Trending model tahminlerini güncelle (30 dakikada bir)
 */
async function updateTrendingModelScheduled() {
  if (trendingModelIsRunning) {
    return
  }

  trendingModelIsRunning = true
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  const nextUpdateTime = new Date(Date.now() + getNextUpdateTime(30)).toLocaleTimeString('tr-TR')
  
  console.log(`\n🤖 [${timeStr}] ========== Trending Model Tahmin Güncelleme Başladı ==========`)
  console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

  const startTime = Date.now()

  try {
    const success = await updateTrending()
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n🤖 [${timeStr}] ========== Trending Model Tahmin Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`🤖 [${timeStr}] Trending Model: ${success ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
    console.log(`═══════════════════════════════════════════════════════════\n`)
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\n❌ [${timeStr}] ========== Trending Model Tahmin Güncelleme Hatası ==========`)
    console.error(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.error(`❌ [${timeStr}] Hata:`, error.message || error)
    console.error(`═══════════════════════════════════════════════════════════\n`)
  } finally {
    trendingModelIsRunning = false
    scheduleTrendingModelNext()
  }
}

/**
 * Trending model tahminleri için sonraki güncellemeyi planla (30 dakika)
 */
function scheduleTrendingModelNext() {
  if (trendingModelSchedulerInterval) {
    clearTimeout(trendingModelSchedulerInterval)
  }

  const delay = getNextUpdateTime(30) // 30 dakika
  trendingModelSchedulerInterval = setTimeout(() => {
    updateTrendingModelScheduled()
  }, delay)
}

/**
 * Crypto list verilerini güncelle
 */
async function updateCrypto() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/crypto/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Crypto list verisi güncellendi (${result.data?.length || 0} coin)`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Crypto list güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Crypto list güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Currency rates verilerini güncelle
 */
async function updateCurrencyRates() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/currency/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Currency rates verisi güncellendi`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Currency rates güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Currency rates güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Fed Rate verilerini güncelle (günde bir kez veya karar zamanı yaklaşınca)
 */
async function updateFedRate() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/fed-rate/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Fed rate verisi güncellendi`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Fed rate güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Fed rate güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * News verilerini güncelle (10 dakikada bir)
 */
async function updateNews() {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/news/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] News verisi güncellendi (${result.count || 0} haber)`)
      return true
    } else {
      const error = await response.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] News güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] News güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Trending verilerini güncelle
 * Crypto listesi güncellendiğinde otomatik çağrılır
 */
async function updateTrending() {
  try {
    // Önce MongoDB'den crypto listesini çek (doğru endpoint)
    const cryptoResponse = await fetch(`${MONGO_API_URL}/api/crypto/list`, {
      headers: { 'Accept': 'application/json' }
    })
    
    if (!cryptoResponse.ok) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: Crypto listesi çekilemedi (HTTP ${cryptoResponse.status})`)
      return false
    }
    
    const cryptoResult = await cryptoResponse.json()
    if (!cryptoResult.success || !cryptoResult.data || !Array.isArray(cryptoResult.data) || cryptoResult.data.length === 0) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: Crypto listesi boş`)
      return false
    }
    
    // Trending'i güncelle (crypto listesi ile)
    const trendingResponse = await fetch(`${MONGO_API_URL}/api/trending/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coins: cryptoResult.data })
    })
    
    if (trendingResponse.ok) {
      const result = await trendingResponse.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.log(`✅ [${timeStr}] Trending verisi güncellendi (${result.data?.coins?.length || 0} coin)`)
      return true
    } else {
      const error = await trendingResponse.text()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: ${error}`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Trending güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Tüm verileri güncelle (Crypto: 5 dakika, Dominance: 5 dakika, Currency Rates: 5 dakika, Fear & Greed: 10 dakika)
 */
async function updateAll() {
  if (isRunning) {
    return
  }

  isRunning = true
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  const nextUpdateTime = new Date(Date.now() + getNextUpdateTime(5)).toLocaleTimeString('tr-TR')
  
  console.log(`\n🔄 [${timeStr}] ========== API Scheduler Güncelleme Başladı ==========`)
  console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

  const startTime = Date.now()

  try {
    // Crypto, Dominance, Currency Rates ve Fed Rate güncelle (PARALEL - farklı endpoint'ler)
    // Fear & Greed ve News ayrı scheduler'larda (10 dakikada bir)
    const [cryptoSuccess, dominanceSuccess, currencySuccess, fedRateSuccess] = await Promise.all([
      updateCrypto(),
      updateDominance(),
      updateCurrencyRates(),
      updateFedRate()
    ])
    
    // Trending model tahminleri artık ayrı scheduler'da yapılıyor (30 dakikada bir)
    // updateAll içinde trending güncellemesi yapılmıyor
    // Not: Trending model tahminleri ayrı scheduler'da yapılıyor (updateTrendingModelScheduled)
    
    // Supply Tracking güncelle (Crypto listesi güncellendiğinde)
    let supplyTrackingSuccess = false
    if (cryptoSuccess) {
      supplyTrackingSuccess = await updateSupplyTracking()
    } else {
      // Crypto başarısız olsa bile supply tracking'i güncellemeyi dene (MongoDB'deki mevcut veri ile)
      supplyTrackingSuccess = await updateSupplyTracking()
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n🔄 [${timeStr}] ========== API Scheduler Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`📈 [${timeStr}] Crypto: ${cryptoSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`📊 [${timeStr}] Dominance: ${dominanceSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`💱 [${timeStr}] Currency Rates: ${currencySuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`🏦 [${timeStr}] Fed Rate: ${fedRateSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`📊 [${timeStr}] Supply Tracking: ${supplyTrackingSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`🤖 [${timeStr}] Trending Model: Ayrı scheduler'da çalışıyor (30 dakikada bir)`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
    console.log(`═══════════════════════════════════════════════════════════\n`)
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\n❌ [${timeStr}] ========== API Scheduler Güncelleme Hatası ==========`)
    console.error(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.error(`❌ [${timeStr}] Hata:`, error.message || error)
    console.error(`═══════════════════════════════════════════════════════════\n`)
  } finally {
    isRunning = false
    scheduleNext()
  }
}

/**
 * Sonraki güncellemeyi planla (Dominance: 5 dakika)
 */
function scheduleNext() {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval)
  }

  const delay = getNextUpdateTime(5) // 5 dakika
  schedulerInterval = setTimeout(() => {
    updateAll()
  }, delay)
}

/**
 * Scheduler'ı başlat
 */
function start() {
  if (schedulerInterval) {
    console.log('⚠️ API Scheduler zaten çalışıyor')
    return
  }

  console.log('🚀 API Scheduler başlatıldı')
  
  // İlk güncellemeyi hemen yapma, sadece sonraki güncellemeyi planla (sabit zamanlarda)
  scheduleNext()
  
  // Fear & Greed scheduler'ı başlat (10 dakikada bir) - SADECE PLANLA, HEMEN ÇALIŞTIRMA
  if (!fearGreedSchedulerInterval) {
    console.log('🚀 Fear & Greed Scheduler başlatıldı (10 dakikada bir)')
    scheduleFearGreedNext() // Sadece zamanlayıcı kur, hemen çalıştırma
  }
  
  // News scheduler'ı başlat (10 dakikada bir) - SADECE PLANLA, HEMEN ÇALIŞTIRMA
  if (!newsSchedulerInterval) {
    console.log('🚀 News Scheduler başlatıldı (10 dakikada bir)')
    scheduleNewsNext() // Sadece zamanlayıcı kur, hemen çalıştırma
  }
  
  // Trending model tahminleri scheduler'ı başlat (30 dakikada bir) - SADECE PLANLA, HEMEN ÇALIŞTIRMA
  if (!trendingModelSchedulerInterval) {
    console.log('🚀 Trending Model Tahmin Scheduler başlatıldı (30 dakikada bir)')
    scheduleTrendingModelNext() // Sadece zamanlayıcı kur, hemen çalıştırma
  }
}

/**
 * Scheduler'ı durdur
 */
function stop() {
  if (schedulerInterval) {
    clearTimeout(schedulerInterval)
    schedulerInterval = null
    console.log('🛑 API Scheduler durduruldu')
  }
  
  if (fearGreedSchedulerInterval) {
    clearTimeout(fearGreedSchedulerInterval)
    fearGreedSchedulerInterval = null
    console.log('🛑 Fear & Greed Scheduler durduruldu')
  }
  
  if (trendingModelSchedulerInterval) {
    clearTimeout(trendingModelSchedulerInterval)
    trendingModelSchedulerInterval = null
    console.log('🛑 Trending Model Tahmin Scheduler durduruldu')
  }
}

/**
 * Supply Tracking verilerini güncelle (5 dakikada bir)
 */
async function updateSupplyTracking() {
  try {
    // Supply tracking handler'ı import et
    const { updateSupplyTracking: updateSupplyTrackingHandler } = await import('./apiHandlers/supplyTracking.js')
    
    // db instance'ını almak için server.js'den import et
    // Not: Bu fonksiyon sadece updateAll() içinde çağrılır, db instance'ı parametre olarak geçilir
    // Şimdilik HTTP isteği yapıyoruz, daha sonra db instance'ı geçilebilir
    const response = await fetch(`${MONGO_API_URL}/api/supply-tracking/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (response.ok) {
      const result = await response.json()
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      if (result.success) {
        console.log(`✅ [${timeStr}] Supply tracking verisi güncellendi`)
        return true
      }
    }
    
    const error = await response.text()
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası: ${error}`)
    return false
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası:`, error.message)
    return false
  }
}

export { start, stop, updateAll, updateSupplyTracking }

