// Crypto Service
// Backend API üzerinden CoinGecko API'ye istek yapar (CORS sorunu çözümü)

const BACKEND_API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'
const COINGECKO_API = 'https://api.coingecko.com/api/v3' // Fallback için (artık kullanılmıyor)
const BINANCE_API = 'https://api.binance.com/api/v3'
const KUCOIN_API = 'https://api.kucoin.com/api/v1'

// Stablecoin'leri filtrele - Kapsamlı liste
const STABLECOIN_IDS = [
  'tether', 'usd-coin', 'dai', 'binance-usd', 'true-usd', 'frax', 
  'tether-gold', 'paxos-standard', 'gemini-dollar', 'usdd', 
  'liquity-usd', 'fei-usd', 'terrausd', 'magic-internet-money',
  'stasis-eurs', 'usd-coin-wormhole', 'tether-eurt', 'usd-coin-avalanche-bridged-usdc.e',
  'usd-coin-polygon', 'usd-coin-arbitrum', 'usd-coin-optimism', 'usd-coin-base',
  'ethena-usde', 'ethena-staked-usde', 'paypal-usd', 'currency-one-usd',
  'blackrock-usd-institutional-digital-liquidity-fund', 'falcon-usd', 'first-digital-usd',
  'usds', 'usdt0', 'usd1', 'usdtb', 'bfusd', 'susds', 'usdg', 'ripple-usd',
  'circle-usyc', 'usual-usd', 'superstate-short-duration-u-s-government-securities-fund',
  'ousg', 'noble-usdc', 'eurc', 'crvusd', 'savings-dai', 'standx-dusd',
  'compounding-opendollar', 'resolv-usr', 'resolv-wstusr', 'cap-usd', 'usda',
  'usdo', 'usx', 'usdb', 'c1usd', 'buidl', 'usdf', 'fdusd', 'usdtb', 'usdt0',
  'usd1', 'usd0', 'usx', 'usda', 'usdo', 'usdb', 'dusd', 'cusdo', 'wstusr', 'usr'
]

const STABLECOIN_SYMBOLS = [
  'usdt', 'usdc', 'dai', 'busd', 'tusd', 'frax', 'usdd', 'lusd', 'fei', 'ust', 'mim', 'eurs', 'eurt',
  'usde', 'susde', 'pyusd', 'c1usd', 'buidl', 'usdf', 'fdusd', 'usds', 'usdt0', 'usd1', 'usdtb',
  'bfusd', 'susds', 'usdg', 'rlusd', 'usyc', 'usd0', 'ustb', 'ousg', 'usdc.n', 'eurc', 'crvusd',
  'sdai', 'dusd', 'cusdo', 'wstusr', 'usr', 'cusd', 'usda', 'usdo', 'usx', 'usdb', 'fdit', 'pc0000031'
]

// Stablecoin kontrolü - isim ve sembol kontrolü
const isStablecoin = (coin) => {
  const id = coin.id?.toLowerCase() || ''
  const symbol = coin.symbol?.toLowerCase() || ''
  const name = coin.name?.toLowerCase() || ''
  
  // ID kontrolü
  if (STABLECOIN_IDS.includes(id)) return true
  
  // Sembol kontrolü
  if (STABLECOIN_SYMBOLS.includes(symbol)) return true
  
  // İsim kontrolü - stablecoin göstergeleri
  const stablecoinKeywords = [
    'usd', 'usdt', 'usdc', 'dai', 'busd', 'tusd', 'frax', 'usdd', 'lusd', 'fei', 'ust', 'mim',
    'eurs', 'eurt', 'usde', 'pyusd', 'usdf', 'fdusd', 'usds', 'usdg', 'rlusd', 'usyc', 'usd0',
    'usd1', 'usdt0', 'usdtb', 'bfusd', 'susds', 'susde', 'ousg', 'buidl', 'c1usd', 'eurc', 'crvusd',
    'sdai', 'dusd', 'cusdo', 'wstusr', 'usr', 'cusd', 'usda', 'usdo', 'usx', 'usdb', 'fdit',
    'stablecoin', 'stable', 'peg', 'pegged', 'wrapped usd', 'wrapped usdt', 'wrapped usdc',
    'bridged usdt', 'bridged usdc', 'bridged usd', 'staked usd', 'staked usdt', 'staked usdc'
  ]
  
  // İsim veya sembol stablecoin keyword içeriyor mu?
  for (const keyword of stablecoinKeywords) {
    if (name.includes(keyword) || symbol.includes(keyword)) {
      // Fiyat kontrolü - stablecoin'ler genellikle ~$1 civarında (daha geniş aralık)
      const price = coin.current_price || 0
      if (price >= 0.95 && price <= 1.05) {
        return true
      }
      // Veya isim/sembol direkt stablecoin göstergesi içeriyorsa (USD, USDT, USDC, DAI, vb.)
      if (name.includes('usd') || name.includes('usdt') || name.includes('usdc') || 
          name.includes('dai') || name.includes('busd') || name.includes('tusd') ||
          symbol.includes('usd') || symbol.includes('usdt') || symbol.includes('usdc') ||
          symbol.includes('dai') || symbol.includes('busd') || symbol.includes('tusd')) {
        return true
      }
    }
  }
  
  // Özel durumlar - isim veya sembol direkt stablecoin formatında
  if (symbol.match(/^usd[0-9]*$/i) || symbol.match(/^usdt[0-9]*$/i) || 
      symbol.match(/^usdc[0-9]*$/i) || symbol.match(/^usd[a-z]*$/i)) {
    return true
  }
  
  if (name.match(/usd[0-9]/i) || name.match(/usdt[0-9]/i) || 
      name.match(/usdc[0-9]/i) || name.match(/bridged.*usd/i) ||
      name.match(/wrapped.*usd/i) || name.match(/staked.*usd/i)) {
    return true
  }
  
  return false
}

// Cache mekanizması (localStorage)
const CACHE_KEY = 'crypto_data_cache'
const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika

const getCachedData = () => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) {
      const { data, timestamp } = JSON.parse(cached)
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data
      }
    }
  } catch (error) {
    // Sessiz devam et
  }
  return null
}

const setCachedData = (data) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }))
  } catch (error) {
    // Sessiz devam et
  }
}

// Retry mekanizması ile fetch
const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    let timeoutId = null
    try {
      // Timeout için AbortController
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 30000) // 30 saniye timeout
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        // CORS için
        mode: 'cors',
        cache: 'no-cache',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      timeoutId = null
      
      if (response.ok) {
        const data = await response.json()
        return { ok: true, data }
      }
      
      // Rate limit kontrolü
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || delay
        await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000))
        continue
      }
      
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    } catch (error) {
      // Timeout'u temizle (eğer hala aktifse)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      if (i === retries - 1) {
        throw error
      }
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)))
    }
  }
}

// Backend API'den crypto listesi çek - 500 coin, stablecoin'ler hariç
const fetchFromCoinGecko = async (useCache = true) => {
  try {
    // Önce cache'den kontrol et
    if (useCache) {
      const cachedData = getCachedData()
      if (cachedData && cachedData.length > 0) {
        // Cache kullanıldığında bile API durumlarını göster (cache'den geldiğini belirt)
        return { 
          data: cachedData, 
          apiStatus: { 
            source: 'cache', 
            success: true,
            apiStatuses: [
              { name: 'Cache', success: true }
            ]
          } 
        }
      }
    }
    
    // Backend API'den çek (CORS sorunu yok)
    const response = await fetch(`${BACKEND_API_URL}/api/crypto/list`, {
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(30000) // 30 saniye timeout
    })
    
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status} ${response.statusText}`)
    }
    
    const result = await response.json()
    
    if (!result.success || !result.data || !Array.isArray(result.data)) {
      throw new Error('Backend API: Invalid response format')
    }
    
    // Backend'den gelen veri zaten filtrelenmiş ve normalize edilmiş (500 coin, stablecoin'ler hariç)
    const normalizedData = result.data || []
    const apiStatuses = result.apiStatuses || [{ name: 'Backend API', success: true }]
    
    // Debug: İlk coin için total_supply ve max_supply kontrolü
    if (normalizedData.length > 0) {
      const sampleCoin = normalizedData[0];
      console.log(`🔍 [cryptoService] Backend'den örnek coin (${sampleCoin.id}): total_supply=${sampleCoin.total_supply}, max_supply=${sampleCoin.max_supply}`);
      const coinsWithTotalSupply = normalizedData.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
      const coinsWithMaxSupply = normalizedData.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;
      console.log(`📊 [cryptoService] Backend'den: ${coinsWithTotalSupply} coin'de total_supply, ${coinsWithMaxSupply} coin'de max_supply var (toplam ${normalizedData.length} coin)`);
    }
    
    if (normalizedData.length === 0) {
      // Cache'den tekrar dene
      const cachedData = getCachedData()
      if (cachedData && cachedData.length > 0) {
        apiStatuses.push({ name: 'Stale Cache Fallback', success: true })
        return { data: cachedData, apiStatus: { source: 'stale_cache', success: true, apiStatuses } }
      }
      throw new Error('No data received from Backend API')
    }
    
    // Son kontrol: Kesinlikle 500 coin döndür
    const limitedData = normalizedData.length > 500 ? normalizedData.slice(0, 500) : normalizedData
    
    // Başarılı veriyi cache'e kaydet
    setCachedData(limitedData)
    
    return { data: limitedData, apiStatus: { source: result.source || 'api', success: true, apiStatuses } }
  } catch (error) {
    // Son çare: Cache'den dene (stale data bile olsa)
    const cachedData = getCachedData()
    if (cachedData && cachedData.length > 0) {
      return { 
        data: cachedData, 
        apiStatus: { 
          source: 'stale_cache_fallback', 
          success: true, 
          error: error.message,
          apiStatuses: [
            { name: 'Stale Cache Fallback', success: true },
            { name: 'API Error', success: false, error: error.message }
          ]
        } 
      }
    }
    
    throw { 
      error, 
      apiStatus: { 
        source: 'api', 
        success: false, 
        error: error.message,
        apiStatuses: [
          { name: 'API Error', success: false, error: error.message }
        ]
      } 
    }
  }
}

// Binance'den OHLC verileri çek
const fetchOHLCFromBinance = async (symbol, interval = '1d', limit = 30) => {
  try {
    // CoinGecko symbol'ü Binance formatına çevir (BTC -> BTCUSDT)
    const binanceSymbol = `${symbol.toUpperCase()}USDT`
    
    const response = await fetch(
      `${BINANCE_API}/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
    )
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`)
    }
    
    const data = await response.json()
    
    // OHLC formatına çevir
    return data.map(candle => ({
      time: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }))
  } catch (error) {
    // Fallback: CoinGecko'dan historical data (coinId gerekli)
    return []
  }
}

// Backend API üzerinden CoinGecko OHLC verileri (fallback)
const fetchOHLCFromCoinGecko = async (coinId, days = 30) => {
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/crypto/ohlc/${coinId}?days=${days}`,
      {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(30000) // 30 saniye timeout
      }
    )
    
    if (!response.ok) {
      throw new Error(`Backend OHLC API error: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (!result.success || !result.data || !Array.isArray(result.data)) {
      throw new Error('Backend OHLC API: Invalid response format')
    }
    
    const data = result.data
    
    return data.map(candle => ({
      time: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4]
    }))
  } catch (error) {
    return []
  }
}

const cryptoService = {
  async fetchCryptoList() {
    try {
      const result = await fetchFromCoinGecko()
      // Eğer result bir obje ise (apiStatus içeriyorsa), sadece data'yı döndür
      if (result && result.data) {
        return result.data
      }
      // Eski format (direkt array) ise direkt döndür
      return result
    } catch (error) {
      // Eğer error bir obje ise (apiStatus içeriyorsa), error'u fırlat
      if (error.error) {
        throw error.error
      }
      throw error
    }
  },

  async fetchCryptoListWithStatus() {
    try {
      const result = await fetchFromCoinGecko()
      return result
    } catch (error) {
      // Eğer error bir obje ise (apiStatus içeriyorsa), onu döndür
      if (error.apiStatus) {
        return { data: [], apiStatus: error.apiStatus }
      }
      throw error
    }
  },

  async fetchTopMovers() {
    try {
      const coins = await this.fetchCryptoList()
      const sorted = [...coins].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
      
      return {
        topGainers: sorted
          .filter((c) => c.price_change_percentage_24h > 0)
          .slice(0, 3)
          .map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            image: coin.image,
            current_price: coin.current_price,
            price_change_percentage_24h: coin.price_change_percentage_24h
          })),
        topLosers: sorted
          .filter((c) => c.price_change_percentage_24h < 0)
          .slice(0, 3)
          .map(coin => ({
            id: coin.id,
            name: coin.name,
            symbol: coin.symbol,
            image: coin.image,
            current_price: coin.current_price,
            price_change_percentage_24h: coin.price_change_percentage_24h
          }))
      }
    } catch (error) {
      throw error
    }
  },

  async fetchOHLCData(symbol, coinId) {
    try {
      // Önce Binance'den 1 saatlik (1h) mumlar çek
      // 30 gün × 24 saat = 720 mum
      const binanceData = await fetchOHLCFromBinance(symbol, '1h', 720)
      if (binanceData && binanceData.length > 0) {
        return binanceData
      }
      
      // Binance başarısız olursa CoinGecko'dan çek
      // CoinGecko sadece günlük veri veriyor, o yüzden 30 gün çekiyoruz
      return await fetchOHLCFromCoinGecko(coinId, 30)
    } catch (error) {
      return []
    }
  }
}

export default cryptoService
