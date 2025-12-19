import MONGODB_CONFIG from '../config/mongodb'
import logger from '../utils/logger'
// Production'da otomatik tespit: environment variable yoksa window.location.origin kullan
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
const MONGO_API_URL = getApiUrl()

// PERFORMANS: localStorage cache key prefix
const CACHE_PREFIX = 'kriptotek_settings_'
const CACHE_TTL = 5 * 60 * 1000 // 5 dakika cache TTL

/**
 * PERFORMANS: LocalStorage'dan cache'lenmiş ayarları al
 * @param {string} userId - Kullanıcı ID
 * @returns {Object|null} Cache'lenmiş ayarlar veya null
 */
const getCachedSettings = (userId) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null

    const cacheKey = `${CACHE_PREFIX}${userId}`
    const cached = localStorage.getItem(cacheKey)

    if (!cached) return null

    const { data, timestamp } = JSON.parse(cached)
    const now = Date.now()

    // Cache hala geçerli mi?
    if (now - timestamp < CACHE_TTL) {
      return data
    }

    // Cache expired, arka planda güncelle ama eski veriyi döndür (stale-while-revalidate)
    return { ...data, _stale: true }
  } catch (error) {
    return null
  }
}

/**
 * PERFORMANS: Ayarları localStorage'a cache'le
 * @param {string} userId - Kullanıcı ID
 * @param {Object} settings - Ayarlar
 */
const setCachedSettings = (userId, settings) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return

    const cacheKey = `${CACHE_PREFIX}${userId}`
    localStorage.setItem(cacheKey, JSON.stringify({
      data: settings,
      timestamp: Date.now()
    }))
  } catch (error) {
    // localStorage full veya disabled - sessizce devam et
  }
}

/**
 * PERFORMANS: Cache'i temizle (logout veya ayar değişikliğinde)
 * @param {string} userId - Kullanıcı ID (opsiyonel, verilmezse tüm cache temizlenir)
 */
export const clearSettingsCache = (userId = null) => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return

    if (userId) {
      localStorage.removeItem(`${CACHE_PREFIX}${userId}`)
    } else {
      // Tüm settings cache'ini temizle
      Object.keys(localStorage)
        .filter(key => key.startsWith(CACHE_PREFIX))
        .forEach(key => localStorage.removeItem(key))
    }
  } catch (error) {
    // Sessizce devam et
  }
}

/**
 * MongoDB'den kullanıcı ayarlarını yükle (localStorage cache ile)
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Kullanıcı ayarları
 */
export const loadUserSettingsFromMongo = async (userId) => {
  try {
    // PERFORMANS: Önce cache'e bak (anında dönüş)
    const cached = getCachedSettings(userId)
    if (cached && !cached._stale) {
      return {
        success: true,
        exists: true,
        source: 'cache',
        settings: cached
      }
    }

    // Cache stale ise arka planda güncelle, stale veriyi hemen döndür
    if (cached && cached._stale) {
      delete cached._stale
      // Arka planda MongoDB'den güncelle (await etme - non-blocking)
      fetchAndCacheFromMongo(userId).catch(() => { })
      return {
        success: true,
        exists: true,
        source: 'stale-cache',
        settings: cached
      }
    }

    // Cache yok, MongoDB'den çek
    return await fetchAndCacheFromMongo(userId)

  } catch (error) {
    console.error('❌ [MongoDB] Error loading user settings:', error.message)
    return {
      success: false,
      exists: false,
      source: 'mongodb',
      error: error.message,
      settings: null
    }
  }
}

/**
 * MongoDB'den çek ve cache'le
 * @param {string} userId - Kullanıcı ID
 */
const fetchAndCacheFromMongo = async (userId) => {
  const response = await fetch(`${MONGO_API_URL}/api/user-settings/${userId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

  if (response.ok) {
    const result = await response.json()

    if (result.success && result.data) {
      const settings = result.data

      // Timestamp'leri düzelt (MongoDB'de number olabilir)
      const normalizedSettings = { ...settings }
      if (normalizedSettings.createdAt && typeof normalizedSettings.createdAt === 'number') {
        normalizedSettings.createdAt = new Date(normalizedSettings.createdAt).toISOString()
      }
      if (normalizedSettings.updatedAt && typeof normalizedSettings.updatedAt === 'number') {
        normalizedSettings.updatedAt = new Date(normalizedSettings.updatedAt).toISOString()
      }

      // PERFORMANS: Cache'e kaydet
      setCachedSettings(userId, normalizedSettings)

      return {
        success: true,
        exists: true,
        source: 'mongodb',
        settings: normalizedSettings
      }
    }
  } else if (response.status === 404) {
    return {
      success: true,
      exists: false,
      source: 'mongodb',
      settings: null
    }
  } else {
    const errorText = await response.text()
    throw new Error(`Backend API error: ${response.status} - ${errorText}`)
  }

  return {
    success: true,
    exists: false,
    source: 'mongodb',
    settings: null
  }
}

/**
 * MongoDB'ye kullanıcı ayarlarını kaydet
 * @param {string} userId - Kullanıcı ID
 * @param {Object} settings - Kaydedilecek ayarlar
 * @returns {Promise<Object>} Sonuç
 */
export const saveUserSettingsToMongo = async (userId, settings) => {
  try {
    // Backend API'ye kaydet
    const response = await fetch(`${MONGO_API_URL}/api/user-settings/${userId}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        ...settings,
        updatedAt: Date.now()
      })
    })

    if (response.ok) {
      const result = await response.json()
      if (result.success) {
        return {
          success: true,
          source: 'mongodb',
          message: 'Ayarlar MongoDB\'ye başarıyla kaydedildi'
        }
      }
    }

    const errorText = await response.text()
    throw new Error(`Backend API error: ${response.status} - ${errorText}`)

  } catch (error) {
    console.error('❌ [MongoDB] Save error:', error.message)
    console.error('❌ [MongoDB] Backend API URL:', MONGO_API_URL)

    return {
      success: false,
      source: 'mongodb',
      error: error.message,
      message: 'Ayarlar MongoDB\'ye kaydedilemedi'
    }
  }
}

/**
 * Kullanıcı ayarlarını yükle (MongoDB'den)
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Kullanıcı ayarları
 */
export const loadUserSettings = async (userId) => {
  // MongoDB'den çek (sadece MongoDB kullanılıyor)
  const mongoResult = await loadUserSettingsFromMongo(userId)
  // Veri yok (404 veya boş)
  if (mongoResult.success && !mongoResult.exists) {
    logger.log('ℹ️ [mongoUserSettings] No user settings found in MongoDB (this is normal for new users)')
    return mongoResult
  }

  // Hata durumu
  if (mongoResult.error) {
    console.error('❌ [mongoUserSettings] Error loading from MongoDB:', mongoResult.error)
    if (mongoResult.error.includes('Failed to fetch') || mongoResult.error.includes('fetch')) {
      console.error('❌ [mongoUserSettings] Backend API çalışmıyor olabilir!')
      console.error('❌ [mongoUserSettings] Backend API URL:', MONGO_API_URL)
      console.error('❌ [mongoUserSettings] Backend API\'yi başlatın: cd server && npm install && npm start')
    }
  }
  return mongoResult
}

/**
 * Kullanıcı ayarlarını kaydet (MongoDB'ye)
 * @param {string} userId - Kullanıcı ID
 * @param {Object} settings - Kaydedilecek ayarlar
 * @returns {Promise<Object>} Sonuç
 */
export const saveUserSettings = async (userId, settings) => {
  // MongoDB'ye kaydet (sadece MongoDB kullanılıyor)
  const mongoResult = await saveUserSettingsToMongo(userId, settings)

  // PERFORMANS: Başarılı kayıtta cache'i güncelle
  if (mongoResult.success) {
    setCachedSettings(userId, { ...settings, updatedAt: Date.now() })
  }

  // Sonucu döndür
  return mongoResult
}

/**
 * Kullanıcı ayarlarını varsayılana sıfırla
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Sonuç
 */
export const resetUserSettings = async (userId) => {
  // ✅ Önce mevcut premium ve admin durumunu al (korunacak)
  let currentIsPremium = false
  let currentAdminEncrypted = null

  try {
    const currentSettings = await loadUserSettings(userId)
    if (currentSettings.success && currentSettings.settings) {
      currentIsPremium = currentSettings.settings.isPremium === true || currentSettings.settings.isPremium === 'true'
      currentAdminEncrypted = currentSettings.settings.adminEncrypted || null
    }
  } catch (error) {
    // Hata durumunda varsayılanları kullan
  }

  const defaultSettings = {
    display: {
      currency: 'USD',
      language: 'tr',
      theme: 'light'
    },
    isPremium: currentIsPremium, // ✅ Mevcut premium durumunu koru
    adminEncrypted: currentAdminEncrypted, // ✅ Mevcut admin durumunu koru
    updatedAt: Date.now()
  }

  return await saveUserSettings(userId, defaultSettings)
}

