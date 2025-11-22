/**
 * Dominance Data Handler
 * CoinMarketCap API'den dominance verilerini çeker
 * 429 hatası durumunda proxy ve alternatif yöntemlerle retry yapar
 */

const COINMARKETCAP_API = 'https://pro-api.coinmarketcap.com/v1'
const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Proxy listesi (crypto.js'den alınan mekanizma)
const FREE_PROXIES = [
  'http://103.49.202.252:80', 'http://103.75.190.195:80', 'http://103.78.141.10:80',
  'http://103.83.232.122:80', 'http://103.85.162.60:80', 'http://103.88.238.227:8080',
  'http://103.90.231.93:80', 'http://103.92.235.250:80', 'http://103.94.52.178:80',
  'http://103.95.40.81:80', 'http://103.96.50.250:80', 'http://103.97.246.82:80'
]

/**
 * Proxy ile fetch yap (basit versiyon - bir proxy dener)
 */
async function fetchWithProxy(url, options) {
  const { fetch, ProxyAgent } = await import('undici')
  
  // Rastgele bir proxy seç
  const randomProxy = FREE_PROXIES[Math.floor(Math.random() * FREE_PROXIES.length)]
  
  try {
    const agent = new ProxyAgent(randomProxy)
    const response = await fetch(url, {
      ...options,
      dispatcher: agent
    })
    return response
  } catch (error) {
    // Proxy başarısız, null döndür
    return null
  }
}

/**
 * Alternatif yöntem: CoinGecko'dan dominance verilerini çek (basit versiyon)
 */
async function fetchDominanceFromCoinGecko() {
  try {
    // CoinGecko'dan global data çek (ücretsiz API, rate limit daha gevşek)
    const response = await fetch(`${COINGECKO_API}/global`, {
      headers: {
        'Accept': 'application/json'
      }
    })
    
    if (!response.ok) {
      return null
    }
    
    const data = await response.json()
    const globalData = data.data
    
    // BTC ve ETH market cap dominance hesapla
    const totalMarketCap = globalData.total_market_cap?.usd || 1
    const btcMarketCap = globalData.market_cap_percentage?.btc || 0
    const ethMarketCap = globalData.market_cap_percentage?.eth || 0
    const othersMarketCap = 100 - btcMarketCap - ethMarketCap
    
    // CoinGecko'dan top 3 coin'i çek (volume için)
    const topCoinsResponse = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=3&sparkline=false`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    )
    
    let top3Coins = []
    let volumeData = []
    let dominanceTableData = []
    let btcVolume = 0
    
    if (topCoinsResponse.ok) {
      const topCoinsData = await topCoinsResponse.json()
      const totalVolume24h = globalData.total_volume?.usd || 1
      
      top3Coins = topCoinsData.map((coin, index) => {
        const volumeDominance = ((coin.total_volume || 0) / totalVolume24h) * 100
        if (coin.symbol?.toLowerCase() === 'btc') {
          btcVolume = coin.total_volume || 0
        }
        return {
          id: coin.id,
          name: coin.name,
          symbol: coin.symbol?.toUpperCase() || '',
          image: coin.image,
          total_volume: coin.total_volume || 0,
          market_cap: coin.market_cap || 0,
          price_change_percentage_24h: coin.price_change_percentage_24h || 0,
          volume_dominance: volumeDominance,
          volume_change_24h: null
        }
      })
      
      volumeData = topCoinsData.slice(0, 5).map(coin => ({
        name: coin.symbol?.toUpperCase() || '',
        volume: coin.total_volume || 0,
        dominance: ((coin.total_volume || 0) / totalVolume24h) * 100,
        image: coin.image,
        change: coin.price_change_percentage_24h || 0
      }))
      
      dominanceTableData = topCoinsData.slice(0, 10).map(coin => ({
        name: coin.name,
        symbol: coin.symbol?.toUpperCase() || '',
        image: coin.image,
        dominance: ((coin.market_cap || 0) / totalMarketCap) * 100,
        marketCap: coin.market_cap || 0,
        volume: coin.total_volume || 0,
        change: coin.price_change_percentage_24h || 0
      }))
    }
    
    return {
      dominanceData: [
        { name: 'BTC', value: btcMarketCap, color: '#f7931a', change: 0 },
        { name: 'ETH', value: ethMarketCap, color: '#627eea', change: 0 },
        { name: 'Others', value: othersMarketCap, color: '#6b7280', change: 0 }
      ],
      volumeData,
      global: {
        total_market_cap: { usd: totalMarketCap },
        total_volume: { usd: globalData.total_volume?.usd || 0 },
        btc_dominance: btcMarketCap,
        eth_dominance: ethMarketCap,
        active_cryptocurrencies: globalData.active_cryptocurrencies || 0,
        active_exchanges: globalData.markets || 0
      },
      top3Coins,
      dominanceTableData,
      btcVolume,
      lastUpdate: Date.now()
    }
  } catch (error) {
    console.warn('⚠️ CoinGecko alternatif yöntem hatası:', error.message)
    return null
  }
}

/**
 * CoinMarketCap API'den dominance verilerini çek
 * Rate limit (429) hatası durumunda proxy ve alternatif yöntemle retry yapar
 */
async function fetchDominanceData(apiKey, maxRetries = 3) {
  if (!apiKey) {
    throw new Error('CoinMarketCap API key eksik')
  }

  // Normal fetch (retry mekanizması ile)
  async function fetchWithRetry(url, retryCount = 0) {
    try {
      const response = await fetch(url, {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          'Accept': 'application/json'
        }
      })

      // Rate limit hatası (429) - özel handling
      if (response.status === 429) {
        // 429 hatası alındı - proxy ve alternatif yöntem denenecek, bu retry loop'undan çık
        throw new Error('RATE_LIMIT_429')
      }

      if (!response.ok) {
        throw new Error(`CoinMarketCap API error: ${response.status}`)
      }

      return response
    } catch (error) {
      // RATE_LIMIT_429 hatası direkt fırlat (proxy/alternatif yöntem denenecek)
      if (error.message === 'RATE_LIMIT_429') {
        throw error
      }
      
      // Retry limit'i aşıldıysa hatayı fırlat
      if (retryCount >= maxRetries) {
        throw error
      }
      
      // Network hatası - exponential backoff ile retry
      const waitTime = Math.min(1000 * Math.pow(2, retryCount), 30000) // Max 30 saniye
      console.warn(`⚠️ CoinMarketCap API network hatası, ${waitTime / 1000} saniye bekleniyor... (Retry ${retryCount + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      
      return fetchWithRetry(url, retryCount + 1)
    }
  }

  // Proxy ile fetch (429 hatası durumunda)
  async function fetchWithProxyRetry(url, retryCount = 0) {
    try {
      console.log('🔄 Proxy ile CoinMarketCap API deneniyor...')
      const proxyResponse = await fetchWithProxy(url, {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          'Accept': 'application/json'
        }
      })

      if (!proxyResponse) {
        throw new Error('Proxy başarısız')
      }

      if (proxyResponse.status === 429) {
        throw new Error('RATE_LIMIT_429_PROXY')
      }

      if (!proxyResponse.ok) {
        throw new Error(`CoinMarketCap API error (proxy): ${proxyResponse.status}`)
      }

      return proxyResponse
    } catch (error) {
      if (error.message === 'RATE_LIMIT_429_PROXY') {
        throw error
      }
      throw error
    }
  }

  try {
    // 1. Global metrics çek (BTC dominance, market cap) - Normal yöntemle
    let globalResponse
    try {
      globalResponse = await fetchWithRetry(`${COINMARKETCAP_API}/global-metrics/quotes/latest`)
    } catch (error) {
      // 429 hatası alındı - proxy ile dene
      if (error.message === 'RATE_LIMIT_429') {
        console.warn('⚠️ 429 hatası alındı, proxy ile deneniyor...')
        try {
          globalResponse = await fetchWithProxyRetry(`${COINMARKETCAP_API}/global-metrics/quotes/latest`)
          console.log('✅ Proxy ile başarılı!')
        } catch (proxyError) {
          // Proxy de başarısız - alternatif yöntem dene
          if (proxyError.message === 'RATE_LIMIT_429_PROXY') {
            console.warn('⚠️ Proxy ile de 429 hatası alındı, alternatif yöntem (CoinGecko) deneniyor...')
            const alternativeData = await fetchDominanceFromCoinGecko()
            if (alternativeData) {
              console.log('✅ Alternatif yöntem (CoinGecko) ile başarılı!')
              return alternativeData
            }
          }
          // Alternatif yöntem de başarısız - hatayı fırlat
          throw new Error('Tüm yöntemler başarısız: Normal, Proxy ve Alternatif (CoinGecko)')
        }
      } else {
        throw error
      }
    }

    const globalData = await globalResponse.json()
    const globalMetrics = globalData.data

    // 2. Top 100 coins çek (BTC volume için) - Rate limit için kısa delay
    await new Promise(resolve => setTimeout(resolve, 1000)) // 1 saniye bekle
    
    let listingsResponse
    try {
      listingsResponse = await fetchWithRetry(
        `${COINMARKETCAP_API}/cryptocurrency/listings/latest?limit=100`
      )
    } catch (error) {
      // 429 hatası alındı - proxy ile dene
      if (error.message === 'RATE_LIMIT_429') {
        console.warn('⚠️ Listings için 429 hatası alındı, proxy ile deneniyor...')
        try {
          listingsResponse = await fetchWithProxyRetry(
            `${COINMARKETCAP_API}/cryptocurrency/listings/latest?limit=100`
          )
        } catch (proxyError) {
          // Proxy de başarısız - alternatif yöntem kullanılmışsa listings olmadan devam et
          if (proxyError.message === 'RATE_LIMIT_429_PROXY') {
            // Alternatif yöntem zaten çağrıldıysa buraya gelmez
            throw new Error('Listings için proxy başarısız')
          }
          throw proxyError
        }
      } else {
        throw error
      }
    }

    const listingsData = await listingsResponse.json()
    const coins = listingsData.data || []

    // BTC'yi bul
    const btc = coins.find(coin => coin.symbol === 'BTC')
    const btcVolume = btc?.quote?.USD?.volume_24h || 0

    // Veriyi formatla
    const btcDominance = globalMetrics.btc_dominance || 0
    const ethDominance = globalMetrics.eth_dominance || 0
    const othersDominance = 100 - btcDominance - ethDominance

    const dominanceData = [
      {
        name: 'BTC',
        value: btcDominance,
        color: '#f7931a',
        change: 0
      },
      {
        name: 'ETH',
        value: ethDominance,
        color: '#627eea',
        change: 0
      },
      {
        name: 'Others',
        value: othersDominance,
        color: '#6b7280',
        change: 0
      }
    ]

    // Volume data (top 5 coin, stablecoinler hariç)
    const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDD', 'LUSD', 'FEI', 'UST', 'MIM', 'EURS', 'EURT', 'USDE', 'PYUSD', 'USDF', 'FDUSD']
    const volumeData = coins
      .filter(coin => !STABLECOIN_SYMBOLS.includes(coin.symbol))
      .slice(0, 5)
      .map(coin => ({
        name: coin.symbol,
        volume: coin.quote?.USD?.volume_24h || 0,
        dominance: ((coin.quote?.USD?.volume_24h || 0) / (globalMetrics.quote?.USD?.total_volume_24h || 1)) * 100,
        image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        change: coin.quote?.USD?.percent_change_24h || 0
      }))

    // Top 3 coins - Volume dominance bilgisi de ekle
    const totalVolume24h = globalMetrics.quote?.USD?.total_volume_24h || 1
    const top3Coins = coins.slice(0, 3).map(coin => {
      const coinVolume = coin.quote?.USD?.volume_24h || 0
      const volumeDominance = (coinVolume / totalVolume24h) * 100
      // CoinMarketCap API'den volume değişimi kontrol et
      // API'de volume_change_24h veya volume_percent_change_24h olabilir
      const volumeChange24h = coin.quote?.USD?.volume_change_24h || 
                               coin.quote?.USD?.volume_percent_change_24h || 
                               null // API'de yoksa null
      
      return {
        id: coin.id.toString(),
        name: coin.name,
        symbol: coin.symbol,
        image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        total_volume: coinVolume,
        market_cap: coin.quote?.USD?.market_cap || 0,
        price_change_percentage_24h: coin.quote?.USD?.percent_change_24h || 0,
        volume_dominance: volumeDominance, // Volume dominance yüzdesi
        volume_change_24h: volumeChange24h // API'den gelen volume değişimi (varsa)
      }
    })

    // Dominance table data
    const totalMarketCap = globalMetrics.quote?.USD?.total_market_cap || 0
    const dominanceTableData = coins.slice(0, 10).map(coin => ({
      name: coin.name,
      symbol: coin.symbol,
      image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
      dominance: ((coin.quote?.USD?.market_cap || 0) / totalMarketCap) * 100,
      marketCap: coin.quote?.USD?.market_cap || 0,
      volume: coin.quote?.USD?.volume_24h || 0,
      change: coin.quote?.USD?.percent_change_24h || 0
    }))

    return {
      dominanceData,
      volumeData,
      global: {
        total_market_cap: { usd: globalMetrics.quote?.USD?.total_market_cap || 0 },
        total_volume: { usd: globalMetrics.quote?.USD?.total_volume_24h || 0 },
        btc_dominance: btcDominance,
        eth_dominance: ethDominance,
        active_cryptocurrencies: globalMetrics.active_cryptocurrencies || 0,
        active_exchanges: globalMetrics.active_exchanges || 0
      },
      top3Coins,
      dominanceTableData,
      btcVolume: btcVolume,
      lastUpdate: Date.now()
    }
  } catch (error) {
    throw new Error(`CoinMarketCap API error: ${error.message}`)
  }
}

export { fetchDominanceData }

