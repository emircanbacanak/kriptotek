/**
 * User Favorites Service
 * MongoDB'den kullanıcı favorilerini yönetir
 * Backend API üzerinden çalışır
 */

const MONGO_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'

/**
 * Kullanıcının favorilerini MongoDB'den yükle
 * @param {string} userId - Kullanıcı ID
 * @param {AbortSignal} signal - İptal sinyali (opsiyonel)
 * @returns {Promise<Object>} Favori kripto ID'leri
 */
export const loadUserFavorites = async (userId, signal = null) => {
  try {
    const response = await fetch(`${MONGO_API_URL}/api/user-favorites/${userId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: signal || undefined
    })

    if (response.ok) {
      const result = await response.json()
      return {
        success: true,
        favorites: result.favorites || []
      }
    } else {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      // İstek iptal edildi, sessizce çık
      return {
        success: false,
        error: 'Request aborted',
        favorites: []
      }
    }
    // Sadece gerçek hataları logla
    if (!error.message.includes('aborted')) {
      console.error('❌ [userFavorites] Error loading favorites:', error.message)
    }
    return {
      success: false,
      error: error.message,
      favorites: []
    }
  }
}

/**
 * Kullanıcının favorilerine kripto ekle
 * @param {string} userId - Kullanıcı ID
 * @param {string} coinId - Eklenecek kripto ID
 * @returns {Promise<Object>} Sonuç
 */
export const addFavorite = async (userId, coinId) => {
  try {
    if (!userId || !coinId) {
      return {
        success: false,
        error: 'Kullanıcı ID veya coin ID eksik'
      }
    }

    const response = await fetch(`${MONGO_API_URL}/api/user-favorites/${userId}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ coinId })
    })

    if (response.ok) {
      const result = await response.json()
      return {
        success: true,
        message: result.message || 'Favori eklendi',
        favorites: result.favorites || []
      }
    } else {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    console.error('❌ [userFavorites] Error adding favorite:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcının favorilerinden kripto çıkar
 * @param {string} userId - Kullanıcı ID
 * @param {string} coinId - Çıkarılacak kripto ID
 * @returns {Promise<Object>} Sonuç
 */
export const removeFavorite = async (userId, coinId) => {
  try {
    if (!userId || !coinId) {
      return {
        success: false,
        error: 'Kullanıcı ID veya coin ID eksik'
      }
    }

    const response = await fetch(`${MONGO_API_URL}/api/user-favorites/${userId}/${coinId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const result = await response.json()
      return {
        success: true,
        message: result.message || 'Favori kaldırıldı',
        favorites: result.favorites || []
      }
    } else {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    console.error('❌ [userFavorites] Error removing favorite:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcının tüm favorilerini sil
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Sonuç
 */
export const clearAllFavorites = async (userId) => {
  try {
    if (!userId) {
      return {
        success: false,
        error: 'Kullanıcı ID eksik'
      }
    }

    const response = await fetch(`${MONGO_API_URL}/api/user-favorites/${userId}`, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const result = await response.json()
      return {
        success: true,
        message: result.message || 'Tüm favoriler temizlendi',
        favorites: []
      }
    } else {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }
  } catch (error) {
    console.error('❌ [userFavorites] Error clearing favorites:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

// Singleton pattern: Aynı userId için sadece bir subscription
const activeSubscriptions = new Map()

/**
 * Real-time favori güncellemelerini dinle (polling)
 * @param {string} userId - Kullanıcı ID
 * @param {Function} callback - Değişiklikler için callback
 * @param {number} intervalMs - Polling interval (ms) - varsayılan 30 saniye
 * @returns {Function} Unsubscribe fonksiyonu
 */
export const subscribeToFavorites = (userId, callback, intervalMs = 30000) => {
  if (!userId) {
    return () => {}
  }

  // Eğer bu userId için zaten bir subscription varsa, onu kullan
  if (activeSubscriptions.has(userId)) {
    const existing = activeSubscriptions.get(userId)
    existing.callbacks.add(callback)
    return () => {
      existing.callbacks.delete(callback)
      if (existing.callbacks.size === 0) {
        if (existing.intervalId) {
          clearInterval(existing.intervalId)
        }
        activeSubscriptions.delete(userId)
      }
    }
  }

  let lastFavorites = null
  let intervalId = null
  let consecutiveErrors = 0
  const MAX_CONSECUTIVE_ERRORS = 3
  const callbacks = new Set([callback])
  let abortController = null
  const subscriptionData = {
    intervalId: null,
    callbacks,
    abortController: null
  }

  const poll = async () => {
    // Önceki isteği iptal et
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()
    subscriptionData.abortController = abortController

    try {
      const result = await loadUserFavorites(userId, abortController.signal)
      if (result.success) {
        consecutiveErrors = 0
        const currentFavorites = result.favorites || []
        
        // Sadece değişiklik varsa callback çağır
        if (JSON.stringify(currentFavorites) !== JSON.stringify(lastFavorites)) {
          lastFavorites = currentFavorites
          callbacks.forEach(cb => {
            try {
              cb({
                success: true,
                favorites: currentFavorites
              })
            } catch (err) {
              console.error('❌ [userFavorites] Callback error:', err)
            }
          })
        }
      } else {
        consecutiveErrors++
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          // Çok fazla hata varsa polling'i durdur
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
          callbacks.forEach(cb => {
            try {
              cb({
                success: false,
                error: 'Too many consecutive errors, polling stopped',
                favorites: lastFavorites || []
              })
            } catch (err) {
              console.error('❌ [userFavorites] Callback error:', err)
            }
          })
          activeSubscriptions.delete(userId)
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return // İstek iptal edildi, sessizce çık
      }
      
      consecutiveErrors++
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        // Çok fazla hata varsa polling'i durdur
        if (intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
        callbacks.forEach(cb => {
          try {
            cb({
              success: false,
              error: error.message,
              favorites: lastFavorites || []
            })
          } catch (err) {
            console.error('❌ [userFavorites] Callback error:', err)
          }
        })
        activeSubscriptions.delete(userId)
      }
    }
  }

  // İlk yükleme
  poll()

  // Polling başlat
  intervalId = setInterval(poll, intervalMs)
  subscriptionData.intervalId = intervalId

  // Subscription'ı kaydet
  activeSubscriptions.set(userId, subscriptionData)

  // Unsubscribe fonksiyonu
  return () => {
    callbacks.delete(callback)
    if (callbacks.size === 0) {
      if (intervalId) {
        clearInterval(intervalId)
      }
      if (abortController) {
        abortController.abort()
      }
      activeSubscriptions.delete(userId)
    }
  }
}

