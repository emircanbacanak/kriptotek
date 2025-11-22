/**
 * Logger utility - Sadece hataları gösterir
 */

export const logger = {
  log: () => {
    // Log mesajları gösterilmez
  },
  
  info: () => {
    // Info mesajları gösterilmez
  },
  
  warn: () => {
    // Uyarılar gösterilmez (sadece error'lar gösterilir)
  },
  
  error: (...args) => {
    // Sadece hatalar gösterilir
    console.error(...args)
  },
  
  debug: () => {
    // Debug mesajları gösterilmez
  }
}

export default logger

