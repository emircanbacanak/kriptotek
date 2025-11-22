// Çok basit brute force koruması (sadece memory içinde, refresh olunca sıfırlanır)
const attempts = {}
const BLOCK_SECONDS = 60
const MAX_ATTEMPTS = 5

export const bruteForceProtection = {
  isBlocked(email) {
    const key = email.toLowerCase()
    const info = attempts[key]
    if (!info) return { blocked: false, remainingTime: 0 }

    const now = Date.now()
    if (info.blockUntil && info.blockUntil > now) {
      const remaining = Math.ceil((info.blockUntil - now) / 1000)
      return { blocked: true, remainingTime: remaining }
    }

    return { blocked: false, remainingTime: 0 }
  },

  recordFailedAttempt(email) {
    const key = email.toLowerCase()
    const now = Date.now()
    const info = attempts[key] || { count: 0, blockUntil: 0 }
    info.count += 1

    if (info.count >= MAX_ATTEMPTS) {
      info.blockUntil = now + BLOCK_SECONDS * 1000
      info.count = 0
      attempts[key] = info
      return { blocked: true, remainingTime: BLOCK_SECONDS, attemptsLeft: 0 }
    }

    const attemptsLeft = MAX_ATTEMPTS - info.count
    attempts[key] = info
    return { blocked: false, remainingTime: 0, attemptsLeft }
  },

  clearAttempts(email) {
    const key = email.toLowerCase()
    delete attempts[key]
  }
}

export const updateLastActivity = () => {
  // Basitçe localStorage'a yaz – istersen Firestore entegrasyonu ekleyebiliriz
  try {
    localStorage.setItem('kriptotek_last_activity', new Date().toISOString())
  } catch {
    // ignore
  }
}

// XSS Protection - HTML sanitization
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return ''
  
  // Tehlikeli HTML tag'lerini ve script'leri kaldır
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // onclick, onerror, etc.
    .replace(/<[^>]+>/g, '') // Tüm HTML tag'lerini kaldır
    .trim()
}

// XSS Protection - HTML content sanitization (sadece güvenli tag'lere izin ver)
export const sanitizeHtmlContent = (html) => {
  if (!html || typeof html !== 'string') return ''
  
  // Sadece güvenli HTML tag'lerine izin ver
  const allowedTags = ['p', 'br', 'strong', 'em', 'u', 'b', 'i', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a']
  const allowedAttributes = ['href', 'target', 'rel', 'class']
  
  // Tehlikeli script ve event handler'ları kaldır
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '') // onclick, onerror, vb.
  
  // Sadece izin verilen tag'leri koru
  const tagPattern = new RegExp(`<(?!\/?(?:${allowedTags.join('|')})\\b)[^>]+>`, 'gi')
  sanitized = sanitized.replace(tagPattern, '')
  
  return sanitized
}

// SQL Injection Protection - Input validation
export const sanitizeForDatabase = (input) => {
  if (!input || typeof input !== 'string') return ''
  
  // SQL injection riski oluşturabilecek karakterleri escape et
  return input
    .replace(/['";\\]/g, '') // SQL özel karakterlerini kaldır
    .replace(/--/g, '') // SQL comment'lerini kaldır
    .replace(/\/\*/g, '') // SQL comment'lerini kaldır
    .replace(/\*\//g, '') // SQL comment'lerini kaldır
    .trim()
}

// URL Validation - XSS ve SSRF koruması
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  
  try {
    const parsedUrl = new URL(url)
    // Sadece http ve https protokollerine izin ver
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false
    }
    // Localhost ve private IP'lere izin verme (production'da)
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsedUrl.hostname
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.16.') ||
        hostname.startsWith('172.17.') ||
        hostname.startsWith('172.18.') ||
        hostname.startsWith('172.19.') ||
        hostname.startsWith('172.20.') ||
        hostname.startsWith('172.21.') ||
        hostname.startsWith('172.22.') ||
        hostname.startsWith('172.23.') ||
        hostname.startsWith('172.24.') ||
        hostname.startsWith('172.25.') ||
        hostname.startsWith('172.26.') ||
        hostname.startsWith('172.27.') ||
        hostname.startsWith('172.28.') ||
        hostname.startsWith('172.29.') ||
        hostname.startsWith('172.30.') ||
        hostname.startsWith('172.31.')
      ) {
        return false
      }
    }
    return true
  } catch {
    return false
  }
}

// CSRF Token generation helper
export const generateCSRFToken = () => {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}


