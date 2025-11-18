// Geliştirme için varsayılanı yerel backend'e yönlendir
const BASE_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'

async function httpGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'GET' })
  if (!res.ok) {
    // OHLC endpoint'i artık 404 döndürmüyor, ama yine de handle edelim
    if (res.status === 404 && path.includes('/ohlc/')) {
      // OHLC için boş veri döndür
      const coinId = path.split('/ohlc/')[1]
      return {
        _id: coinId,
        coinId: coinId,
        data: [],
        lastUpdate: Date.now(),
        dataPoints: 0
      }
    }
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  if (!body.ok) throw new Error(body.error || 'request_failed')
  return body.data
}

async function httpPut(path, data) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json()
  if (!body.ok) throw new Error(body.error || 'request_failed')
  return true
}

export const mongoApiClient = {
  // api_cache
  async getCache(key) {
    const doc = await httpGet(`/cache/${encodeURIComponent(key)}`)
    return doc
  },
  async setCache(key, data) {
    return await httpPut(`/cache/${encodeURIComponent(key)}`, data)
  },

  // ohlc_data
  // interval: '1h' (anasayfa, 30 günlük veri) veya '15m' (liquidation map)
  async getOHLC(coinId, interval = '1h') {
    try {
      const queryParams = new URLSearchParams({ interval })
      const result = await httpGet(`/ohlc/${encodeURIComponent(coinId)}?${queryParams.toString()}`)
      // Server artık her zaman ok: true döndürüyor (404 yerine boş veri)
      return result
    } catch (e) {
      // Hata durumunda boş veri döndür
      return {
        _id: coinId,
        coinId: coinId,
        data: [],
        lastUpdate: Date.now(),
        dataPoints: 0,
        interval: interval
      }
    }
  },
  async setOHLC(coinId, data) {
    return await httpPut(`/ohlc/${encodeURIComponent(coinId)}`, data)
  },

  // supply_history
  async getSupplyHistory(id) {
    const doc = await httpGet(`/supply-history/${encodeURIComponent(id)}`)
    return doc
  },
  async setSupplyHistory(id, data) {
    return await httpPut(`/supply-history/${encodeURIComponent(id)}`, data)
  },

  // crypto_news
  async getNews(params = {}) {
    const { limit = 100, orderBy = 'publishedAt', order = 'desc' } = params
    const query = new URLSearchParams({ limit: limit.toString(), orderBy, order })
    const res = await fetch(`${BASE_URL}/api/news?${query}`, { method: 'GET' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return body.data
  },
  async saveNews(newsItems) {
    const res = await fetch(`${BASE_URL}/api/news`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newsItems)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return body
  },
  async updateNews(id, data) {
    return await httpPut(`/api/news/${encodeURIComponent(id)}`, data)
  },
  async deleteNews(id) {
    const res = await fetch(`${BASE_URL}/api/news/${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return true
  },

  // portfolio endpoints removed

  // dominance_snapshots
  async getDominanceSnapshots(params = {}) {
    const { limit = 7, orderBy = 'date', order = 'desc' } = params
    const query = new URLSearchParams({ limit: limit.toString(), orderBy, order })
    const res = await fetch(`${BASE_URL}/dominance-snapshots?${query}`, { method: 'GET' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return body.data
  },
  async getDominanceSnapshot(date) {
    const res = await fetch(`${BASE_URL}/dominance-snapshots/${encodeURIComponent(date)}`, { method: 'GET' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return body.data
  },
  async saveDominanceSnapshot(date, data) {
    return await httpPut(`/dominance-snapshots/${encodeURIComponent(date)}`, data)
  },
  async deleteDominanceSnapshot(date) {
    const res = await fetch(`${BASE_URL}/dominance-snapshots/${encodeURIComponent(date)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    if (!body.ok) throw new Error(body.error || 'request_failed')
    return true
  }
}

export default mongoApiClient

