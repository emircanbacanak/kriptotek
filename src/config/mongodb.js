const MONGODB_CONFIG = {
  connectionString: import.meta.env.VITE_MONGODB_URI,
  
  // Database name
  databaseName: import.meta.env.VITE_MONGODB_DB_NAME,
  
  // API endpoint (Backend API'nin MongoDB'ye bağlanması için)
  apiEndpoint: import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000/api',
  
  // Collections
  collections: {
    users: 'users',
    cryptoData: 'crypto_data',
    userPortfolio: 'user_portfolio',
    userSettings: 'user_settings', // MongoDB collection adı
    userFavorites: 'user_favorites', // MongoDB collection adı
    favorites: 'favorites',
    settings: 'settings',
    transactions: 'transactions'
  }
}

export default MONGODB_CONFIG

// Backend API fonksiyonları (örnek)
export const mongoAPI = {
  // Kullanıcı işlemleri
  async getUserData(userId) {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/users/${userId}`)
    return response.json()
  },
  
  // Crypto verileri
  async getCryptoData() {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/crypto`)
    return response.json()
  },
  
  // Portfolio işlemleri
  async getUserPortfolio(userId) {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/portfolio/${userId}`)
    return response.json()
  },
  
  // Favoriler
  async getFavorites(userId) {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/favorites/${userId}`)
    return response.json()
  },
  
  async addFavorite(userId, coinId) {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/favorites/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coinId })
    })
    return response.json()
  },
  
  async removeFavorite(userId, coinId) {
    const response = await fetch(`${MONGODB_CONFIG.apiEndpoint}/favorites/${userId}/${coinId}`, {
      method: 'DELETE'
    })
    return response.json()
  }
}

