// Basit matematik CAPTCHA
export const generateMathCaptcha = () => {
  const a = Math.floor(Math.random() * 10) + 1
  const b = Math.floor(Math.random() * 10) + 1
  const question = `${a} + ${b} = ?`
  const answer = a + b
  const hash = btoa(String(answer))
  return { question, hash }
}

export const verifyCaptcha = (answer, hash) => {
  try {
    const real = parseInt(atob(hash), 10)
    return Number(answer) === real
  } catch {
    return false
  }
}

// AES Encryption/Decryption için basit bir implementasyon
// NOT: Production'da daha güvenli bir kütüphane kullanılmalı (crypto-js gibi)
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'kriptotek-secret-key-2024'

/**
 * Basit AES benzeri şifreleme (Base64 + XOR)
 * Production'da crypto-js veya Web Crypto API kullanılmalı
 */
export const encryptAES = (data) => {
  try {
    const dataStr = JSON.stringify(data)
    const key = ENCRYPTION_KEY
    
    // Basit XOR şifreleme
    let encrypted = ''
    for (let i = 0; i < dataStr.length; i++) {
      const charCode = dataStr.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      encrypted += String.fromCharCode(charCode)
    }
    
    // Base64 encode
    return btoa(encrypted)
  } catch (error) {
    console.error('Encryption error:', error)
    return null
  }
}

/**
 * Basit AES benzeri deşifreleme (Base64 + XOR)
 */
export const decryptAES = (encryptedData) => {
  try {
    if (!encryptedData) return null
    
    // Eğer string değilse veya boşsa null döndür
    if (typeof encryptedData !== 'string' || encryptedData.trim() === '') {
      return null
    }
    
    const key = ENCRYPTION_KEY
    
    // Base64 decode - hata kontrolü
    let encrypted
    try {
      encrypted = atob(encryptedData)
    } catch (e) {
      // Base64 decode hatası - muhtemelen yanlış format
      // Sessizce null döndür (bu normal bir durum olabilir)
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_DECRYPT === 'true') {
        console.warn('⚠️ [decryptAES] Base64 decode hatası (normal olabilir):', e.message)
      }
      return null
    }
    
    // XOR deşifreleme
    let decrypted = ''
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      decrypted += String.fromCharCode(charCode)
    }
    
    // JSON parse - hata kontrolü
    try {
      return JSON.parse(decrypted)
    } catch (e) {
      // JSON parse hatası - muhtemelen yanlış şifreleme veya eski format
      // Sessizce null döndür (bu normal bir durum olabilir - eski format değerler için)
      // Debug modunda sadece logla
      if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_DECRYPT === 'true') {
        console.warn('⚠️ [decryptAES] JSON parse hatası (normal olabilir):', e.message)
      }
      return null
    }
  } catch (error) {
    console.error('❌ [decryptAES] Genel hata:', error)
    return null
  }
}


