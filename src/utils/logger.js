/**
 * Logger utility - Production'da sadece hataları gösterir
 */

const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args)
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args)
    }
  },
  
  warn: (...args) => {
    // Uyarılar her zaman gösterilir
    console.warn(...args)
  },
  
  error: (...args) => {
    // Hatalar her zaman gösterilir
    console.error(...args)
  },
  
  debug: (...args) => {
    if (isDevelopment) {
      console.debug(...args)
    }
  }
}

export default logger

