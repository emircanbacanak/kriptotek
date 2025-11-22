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

/**
 * MongoDB'den kullanıcı ayarlarını yükle
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Kullanıcı ayarları
 */
export const loadUserSettingsFromMongo = async (userId) => {
  try {
    // Backend API'den çek
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
    
  } catch (error) {
    console.error('❌ [MongoDB] Error loading user settings:', error.message)
    console.error('❌ [MongoDB] Backend API URL:', MONGO_API_URL)
    
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
        logger.log('✅ [MongoDB] User settings saved to backend API')
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
  
  // Sonucu döndür
  return mongoResult
}

/**
 * Kullanıcı ayarlarını varsayılana sıfırla
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Sonuç
 */
export const resetUserSettings = async (userId) => {
  const defaultSettings = {
    display: {
      currency: 'USD',
      language: 'tr',
      theme: 'light'
    },
    isPremium: false, // Premium durumu korunur, sadece ayarlar sıfırlanır
    adminEncrypted: null, // Admin durumu korunur (client-side'da kontrol edilir)
    updatedAt: Date.now()
  }
  
  return await saveUserSettings(userId, defaultSettings)
}

