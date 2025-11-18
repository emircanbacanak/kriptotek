/**
 * API Scheduler
 * Her 5 dakikada bir dominance ve fear & greed verilerini günceller
 */

const MONGO_API_URL = process.env.MONGO_API_URL || 'http://localhost:3000'

let schedulerInterval = null
let isRunning = false

/**
 * Sonraki güncelleme zamanını hesapla
 * Dominance: 5 dakikalık sabit aralıklar (00:05, 00:10, 00:15, ...)
 * Fear & Greed: 10 dakikalık sabit aralıklar (00:10, 00:20, 00:30, ...)
 */
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
 * Tüm verileri güncelle (Crypto: 5 dakika, Dominance: 5 dakika, Fear & Greed: 10 dakika)
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
    // Crypto ve Dominance güncelle (Fear & Greed ayrı scheduler'da)
    const [cryptoSuccess, dominanceSuccess] = await Promise.all([
      updateCrypto(),
      updateDominance()
    ])

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`\n🔄 [${timeStr}] ========== API Scheduler Güncelleme Tamamlandı ==========`)
    console.log(`⏱️  [${timeStr}] Toplam süre: ${duration}s`)
    console.log(`📈 [${timeStr}] Crypto: ${cryptoSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
    console.log(`📊 [${timeStr}] Dominance: ${dominanceSuccess ? '✅ Başarılı' : '❌ Başarısız'}`)
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
  
  // İlk güncellemeyi hemen yap (Dominance)
  updateAll()
  
  // Fear & Greed scheduler'ı başlat (10 dakikada bir)
  if (!fearGreedSchedulerInterval) {
    console.log('🚀 Fear & Greed Scheduler başlatıldı (10 dakikada bir)')
    updateFearGreedScheduled()
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
}

export { start, stop, updateAll }

