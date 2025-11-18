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


