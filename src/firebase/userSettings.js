import { db } from './firebaseConfig'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

/**
 * Kullanıcı ayarlarını Firestore'dan yükle
 * @param {string} userId - Kullanıcı ID
 * @returns {Promise<Object>} Kullanıcı ayarları
 */
export const loadUserSettings = async (userId) => {
  try {
    const settingsRef = doc(db, 'userSettings', userId)
    const settingsSnap = await getDoc(settingsRef)
    
    if (settingsSnap.exists()) {
      return {
        success: true,
        exists: true,
        source: 'firestore',
        settings: settingsSnap.data()
      }
    } else {
      return {
        success: true,
        exists: false,
        source: 'firestore',
        settings: null
      }
    }
  } catch (error) {
    // Offline durumunu sessizce handle et
    if (error.code === 'unavailable') {
      // Offline durumunda varsayılan değerleri döndür
      return {
        success: false,
        exists: false,
        offline: true,
        settings: null
      }
    }
    
    // Diğer hataları sadece development modunda göster
    if (import.meta.env.DEV) {
      console.error('❌ [loadUserSettings] Error occurred:', {
        code: error.code,
        message: error.message,
        name: error.name
      })
    }
    
    return {
      success: false,
      exists: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcı ayarlarını Firestore'a kaydet
 * @param {string} userId - Kullanıcı ID
 * @param {Object} settings - Kaydedilecek ayarlar
 * @returns {Promise<Object>} Sonuç
 */
export const saveUserSettings = async (userId, settings) => {
  try {
    const settingsRef = doc(db, 'userSettings', userId)
    
    // Belgenin var olup olmadığını kontrol et
    const settingsSnap = await getDoc(settingsRef)
    const isNewDocument = !settingsSnap.exists()
    
    const settingsData = {
      ...settings,
      updatedAt: new Date().toISOString()
    }
    
    // Yeni belge oluşturuluyorsa adminEncrypted alanını kaldır (Firestore Rules'da create sırasında yasak)
    if (isNewDocument) {
      delete settingsData.adminEncrypted
    }
    
    // Belge yoksa oluştur, varsa güncelle
    await setDoc(settingsRef, settingsData, { merge: true })
    
    return {
      success: true,
      message: 'Ayarlar başarıyla kaydedildi'
    }
  } catch (error) {
    // Offline durumunu sessizce handle et
    if (error.code === 'unavailable') {
      // Offline durumunda başarısız olarak döndür ama hata mesajı gösterme
      return {
        success: false,
        offline: true,
        error: 'Offline mode - changes will be saved when connection is restored'
      }
    }
    
    // Diğer hataları sadece development modunda göster
    if (import.meta.env.DEV) {
      console.error('❌ [saveUserSettings] Error occurred:', {
        code: error.code,
        message: error.message,
        name: error.name
      })
    }
    
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcı ayarlarının belirli bir bölümünü güncelle
 * @param {string} userId - Kullanıcı ID
 * @param {string} category - Ayar kategorisi (örn: 'display')
 * @param {string} key - Ayar anahtarı (örn: 'currency')
 * @param {any} value - Yeni değer
 * @returns {Promise<Object>} Sonuç
 */
export const updateUserSetting = async (userId, category, key, value) => {
  try {
    const settingsRef = doc(db, 'userSettings', userId)
    
    // Nested field güncelleme
    const updateData = {
      [`${category}.${key}`]: value,
      updatedAt: new Date().toISOString()
    }
    
    await updateDoc(settingsRef, updateData)
    
    return {
      success: true,
      message: 'Ayar başarıyla güncellendi'
    }
  } catch (error) {
    console.error('Error updating user setting:', error)
    return {
      success: false,
      error: error.message
    }
  }
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
    isPremium: false,
    adminEncrypted: null,
    updatedAt: new Date().toISOString()
  }
  
  return await saveUserSettings(userId, defaultSettings)
}
