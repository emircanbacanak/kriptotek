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

// MongoDB db instance (server.js'den set edilecek)
let dbInstance = null

/**
 * MongoDB db instance'ını set et
 */
function setDbInstance(db) {
  dbInstance = db
}

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
 * Dominance verilerini güncelle (helper function)
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
      if (result.cached) {
        console.log(`✅ [${timeStr}] Dominance verisi cache'den alındı (API rate limit - CoinMarketCap)`)
      } else {
        console.log(`✅ [${timeStr}] Dominance verisi güncellendi (CoinMarketCap)`)
      }
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
 * Dominance verilerini güncelle (10 dakikada bir - scheduled)
 */
async function updateDominanceScheduled() {
  if (dominanceIsRunning) {
    return
  }

  dominanceIsRunning = true
  const timeStr = new Date().toLocaleTimeString('tr-TR')
  const nextUpdateTime = new Date(Date.now() + getNextUpdateTime(10)).toLocaleTimeString('tr-TR')
  
  console.log(`\n📊 [${timeStr}] ========== Dominance Güncelleme Başladı ==========`)
  console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)

  const startTime = Date.now()

  try {
    const success = await updateDominance()
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n📊 [${timeStr}] ========== Dominance Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`📊 [${timeStr}] Dominance: ${success ? '✅ Başarılı' : '❌ Başarısız (bir sonraki scheduled zamanda tekrar denenecek)'}`)
    console.log(`⏰ [${timeStr}] Bir sonraki güncelleme: ${nextUpdateTime}`)
    console.log(`═══════════════════════════════════════════════════════════\n`)
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.error(`\n❌ [${timeStr}] ========== Dominance Güncelleme Hatası ==========`)
    console.error(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.error(`❌ [${timeStr}] Hata:`, error.message || error)
    console.error(`📊 [${timeStr}] Dominance: ❌ Başarısız (bir sonraki scheduled zamanda tekrar denenecek)`)
    console.error(`═══════════════════════════════════════════════════════════\n`)
  } finally {
    dominanceIsRunning = false
    scheduleDominanceNext()
  }
}

/**
 * Dominance için sonraki güncellemeyi planla (10 dakika)
 */
function scheduleDominanceNext() {
  if (dominanceSchedulerInterval) {
    clearTimeout(dominanceSchedulerInterval)
  }

  const delay = getNextUpdateTime(10) // 10 dakika
  dominanceSchedulerInterval = setTimeout(() => {
    updateDominanceScheduled()
  }, delay)
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

// Dominance için ayrı scheduler (10 dakikada bir)
let dominanceSchedulerInterval = null
let dominanceIsRunning = false

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
 * Trending model tahminleri için sonraki güncellemeyi planla (sabit saatler: 00:00, 00:30, 01:00, 01:30, ...)
 */
function scheduleTrendingModelNext() {
  if (trendingModelSchedulerInterval) {
    clearTimeout(trendingModelSchedulerInterval)
  }

  const now = new Date()
  const currentMinutes = now.getMinutes()
  const currentSeconds = now.getSeconds()
  
  // Bir sonraki sabit saati hesapla (00:00, 00:30, 01:00, 01:30, ...)
  const nextUpdate = new Date(now)
  
  if (currentMinutes < 30) {
    // 00:00-00:29 arasındaysa, 00:30'a git
    nextUpdate.setMinutes(30)
    nextUpdate.setSeconds(0)
    nextUpdate.setMilliseconds(0)
  } else {
    // 00:30-00:59 arasındaysa, bir sonraki saatin 00:00'ına git
    nextUpdate.setHours(nextUpdate.getHours() + 1)
    nextUpdate.setMinutes(0)
    nextUpdate.setSeconds(0)
    nextUpdate.setMilliseconds(0)
  }
  
  // Eğer şu anda tam 00:00 veya 00:30 ise ve henüz 10 saniye geçmediyse, hemen çalıştır
  // Aksi halde bir sonraki sabit saate kadar bekle
  let delay = nextUpdate.getTime() - now.getTime()
  
  // Delay çok kısa ise (0-10 saniye arası) ve henüz geçmediyse hemen çalıştır
  if (delay > 0 && delay < 10000 && (currentMinutes === 0 || currentMinutes === 30) && currentSeconds < 10) {
    delay = 1000 // 1 saniye sonra çalıştır
  }
  
  // Delay negatif veya çok küçükse, bir sonraki 30 dakikalık slot'a geç
  if (delay < 1000) {
    if (currentMinutes < 30) {
      nextUpdate.setMinutes(30)
    } else {
      nextUpdate.setHours(nextUpdate.getHours() + 1)
      nextUpdate.setMinutes(0)
    }
    nextUpdate.setSeconds(0)
    nextUpdate.setMilliseconds(0)
    delay = nextUpdate.getTime() - now.getTime()
  }
  
  const nextTimeStr = nextUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  console.log(`⏰ Trending Model: Bir sonraki güncelleme ${nextTimeStr} (${Math.round(delay / 1000 / 60)} dakika sonra)`)
  
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
 * MongoDB'den direkt crypto listesini çeker (ayrı API isteği yapmaz)
 */
async function updateTrending() {
  try {
    if (!dbInstance) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: MongoDB bağlantısı yok`)
      return false
    }

    // MongoDB'den direkt crypto listesini çek (home ekranında zaten çekilip kaydedilmiş)
    const collection = dbInstance.collection('api_cache')
    const cryptoDoc = await collection.findOne({ _id: 'crypto_list' })
    
    if (!cryptoDoc || !cryptoDoc.data || !Array.isArray(cryptoDoc.data) || cryptoDoc.data.length === 0) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: Crypto listesi MongoDB'de bulunamadı`)
      return false
    }
    
    const coins = cryptoDoc.data
    
    // calculateTrendingScores fonksiyonunu import et (server.js'den dinamik import)
    const serverModule = await import('../server.js')
    const calculateTrendingScores = serverModule.calculateTrendingScores
    
    if (!calculateTrendingScores) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Trending güncelleme hatası: calculateTrendingScores fonksiyonu bulunamadı`)
      return false
    }
    
    // Trending'i güncelle (crypto listesi ile) - SADECE AI TAHMİNLEME YAP
    const trendingCoins = calculateTrendingScores(coins)
    
    // Mevcut trending verilerini al (fiyat verilerini korumak için)
    const trendingCollection = dbInstance.collection('trending_data')
    const existingTrending = await trendingCollection.findOne({ _id: 'trending_coins' })
    
    // Yeni AI tahminleme verilerini mevcut verilerle birleştir
    // ÖNEMLİ: prediction_base_price her zaman güncel fiyattan alınmalı (tahmin yapılırkenki fiyat)
    const mergedCoins = trendingCoins.map(newCoin => {
      if (existingTrending?.coins) {
        const existingCoin = existingTrending.coins.find(c => c.id === newCoin.id)
        if (existingCoin) {
          // Mevcut coin'in fiyat verilerini koru, sadece AI tahminleme verilerini güncelle
          // prediction_base_price: Tahmin yapılırkenki güncel fiyat (her zaman güncellenmeli)
          return {
            ...existingCoin,
            // Fiyat verilerini güncelle (güncel fiyat)
            current_price: newCoin.current_price || existingCoin.current_price,
            price: newCoin.price || existingCoin.price,
            // AI tahminleme verilerini güncelle
            ai_prediction: newCoin.ai_prediction,
            ai_direction: newCoin.ai_direction,
            ai_emoji: newCoin.ai_emoji,
            ai_color: newCoin.ai_color,
            position_type: newCoin.position_type,
            predicted_price: newCoin.predicted_price,
            prediction_base_price: newCoin.prediction_base_price, // Güncel fiyattan alınmalı
            ai_confidence: newCoin.ai_confidence,
            // Trend skorlarını da güncelle
            trend_score: newCoin.trend_score,
            trend_level: newCoin.trend_level,
            trend_emoji: newCoin.trend_emoji,
            trend_color: newCoin.trend_color
          }
        }
      }
      return newCoin
    })
    
    // MongoDB'ye kaydet
    await trendingCollection.updateOne(
      { _id: 'trending_coins' },
      { 
        $set: {
          coins: mergedCoins,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )
    
      const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.log(`✅ [${timeStr}] Trending AI tahminleme güncellendi (${mergedCoins.length} coin) - MongoDB'den direkt çekildi`)
      return true
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
    // Crypto, Currency Rates ve Fed Rate güncelle (PARALEL - farklı endpoint'ler)
    // Dominance, Fear & Greed ve News ayrı scheduler'larda (10 dakikada bir)
    const [cryptoSuccess, currencySuccess, fedRateSuccess] = await Promise.all([
      updateCrypto(),
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
    console.log(`📊 [${timeStr}] Dominance: Ayrı scheduler'da çalışıyor (10 dakikada bir)`)
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
  
  // Dominance scheduler'ı başlat (10 dakikada bir) - SADECE PLANLA, HEMEN ÇALIŞTIRMA
  if (!dominanceSchedulerInterval) {
    console.log('🚀 Dominance Scheduler başlatıldı (10 dakikada bir)')
    scheduleDominanceNext() // Sadece zamanlayıcı kur, hemen çalıştırma
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
  
  if (newsSchedulerInterval) {
    clearTimeout(newsSchedulerInterval)
    newsSchedulerInterval = null
    console.log('🛑 News Scheduler durduruldu')
  }
  
  if (dominanceSchedulerInterval) {
    clearTimeout(dominanceSchedulerInterval)
    dominanceSchedulerInterval = null
    console.log('🛑 Dominance Scheduler durduruldu')
  }
  
  if (trendingModelSchedulerInterval) {
    clearTimeout(trendingModelSchedulerInterval)
    trendingModelSchedulerInterval = null
    console.log('🛑 Trending Model Tahmin Scheduler durduruldu')
  }
}

/**
 * Supply Tracking verilerini güncelle (30 dakikada bir)
 * MongoDB'den direkt çeker (ayrı API isteği yapmaz)
 */
async function updateSupplyTracking() {
  try {
    if (!dbInstance) {
      const timeStr = new Date().toLocaleTimeString('tr-TR')
      console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası: MongoDB bağlantısı yok`)
      return false
    }

    // Supply tracking handler'ı import et
    const { updateSupplyTracking: updateSupplyTrackingHandler } = await import('./apiHandlers/supplyTracking.js')
    
    // MongoDB'den direkt çek (ayrı API isteği yapmadan)
    const success = await updateSupplyTrackingHandler(dbInstance)
    
      const timeStr = new Date().toLocaleTimeString('tr-TR')
    if (success) {
      console.log(`✅ [${timeStr}] Supply tracking verisi güncellendi - MongoDB'den direkt çekildi`)
        return true
    } else {
      console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası`)
      return false
    }
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası:`, error.message)
    return false
  }
}

export { start, stop, updateAll, updateSupplyTracking, setDbInstance }

