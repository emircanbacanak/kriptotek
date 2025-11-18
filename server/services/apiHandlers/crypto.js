/**
 * Crypto List Handler
 * CoinGecko API'den kripto para listesi çeker, stablecoin'leri filtreler ve normalize eder
 * Her batch için farklı proxy kullanır (rate limit ve Cloudflare koruması için)
 */

const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Ücretsiz proxy listesi (her batch için farklı proxy kullanılacak)
const FREE_PROXIES = [
  'http://103.149.162.194:80',
  'http://103.152.112.162:80',
  'http://103.48.68.107:83',
  'http://103.49.202.252:80',
  'http://103.75.190.195:80',
  'http://103.78.141.10:80',
  'http://103.83.232.122:80',
  'http://103.85.162.60:80',
  'http://103.88.238.227:8080',
  'http://103.90.231.93:80',
  'http://103.92.235.250:80',
  'http://103.94.52.178:80',
  'http://103.95.40.81:80',
  'http://103.96.50.250:80',
  'http://103.97.246.82:80',
  'http://103.98.72.162:80',
  'http://45.77.56.214:8080',
  'http://45.77.56.215:8080',
  'http://45.77.56.216:8080',
  'http://45.77.56.217:8080',
  'http://45.77.56.218:8080',
  'http://45.77.56.219:8080',
  'http://45.77.56.220:8080',
  'http://45.77.56.221:8080',
  'http://45.77.56.222:8080',
  'http://45.77.56.223:8080',
  'http://185.199.228.220:8080',
  'http://185.199.229.220:8080',
  'http://185.199.230.220:8080',
  'http://185.199.231.220:8080',
  'http://185.199.232.220:8080',
  'http://185.199.233.220:8080',
  'http://185.199.234.220:8080',
  'http://185.199.235.220:8080',
  'http://185.199.236.220:8080',
  'http://185.199.237.220:8080',
  'http://185.199.238.220:8080',
  'http://185.199.239.220:8080',
  'http://185.199.240.220:8080',
  'http://185.199.241.220:8080',
  'http://185.199.242.220:8080',
  'http://185.199.243.220:8080',
  'http://185.199.244.220:8080',
  'http://185.199.245.220:8080',
  'http://185.199.246.220:8080',
  'http://185.199.247.220:8080',
  'http://185.199.248.220:8080',
  'http://185.199.249.220:8080',
  'http://185.199.250.220:8080',
  'http://185.199.251.220:8080',
  'http://185.199.252.220:8080',
  'http://185.199.253.220:8080',
  'http://185.199.254.220:8080',
  'http://185.199.255.220:8080',
  'http://185.200.0.220:8080',
  'http://185.200.1.220:8080',
  'http://185.200.2.220:8080',
  'http://185.200.3.220:8080',
  'http://185.200.4.220:8080',
  'http://185.200.5.220:8080',
  'http://185.200.6.220:8080',
  'http://185.200.7.220:8080',
  'http://185.200.8.220:8080',
  'http://185.200.9.220:8080',
  'http://185.200.10.220:8080',
  'http://185.200.11.220:8080',
  'http://185.200.12.220:8080',
  'http://185.200.13.220:8080',
  'http://185.200.14.220:8080',
  'http://185.200.15.220:8080',
  'http://185.200.16.220:8080',
  'http://185.200.17.220:8080',
  'http://185.200.18.220:8080',
  'http://185.200.19.220:8080',
  'http://185.200.20.220:8080',
  'http://185.200.21.220:8080',
  'http://185.200.22.220:8080',
  'http://185.200.23.220:8080',
  'http://185.200.24.220:8080',
  'http://185.200.25.220:8080',
  'http://185.200.26.220:8080',
  'http://185.200.27.220:8080',
  'http://185.200.28.220:8080',
  'http://185.200.29.220:8080',
  'http://185.200.30.220:8080',
  'http://185.200.31.220:8080',
  'http://185.200.32.220:8080',
  'http://185.200.33.220:8080',
  'http://185.200.34.220:8080',
  'http://185.200.35.220:8080',
  'http://185.200.36.220:8080',
  'http://185.200.37.220:8080',
  'http://185.200.38.220:8080',
  'http://185.200.39.220:8080',
  'http://185.200.40.220:8080',
  'http://185.200.41.220:8080',
  'http://185.200.42.220:8080',
  'http://185.200.43.220:8080',
  'http://185.200.44.220:8080',
  'http://185.200.45.220:8080',
  'http://185.200.46.220:8080',
  'http://185.200.47.220:8080',
  'http://185.200.48.220:8080',
  'http://185.200.49.220:8080',
  'http://185.200.50.220:8080'
]

// Çalışmayan proxy'leri takip et
const failedProxies = new Set()
const workingProxies = new Set()

/**
 * Proxy'nin çalışıp çalışmadığını test et (hızlı test - CoinGecko API'ye basit bir istek)
 */
async function testProxy(proxyUrl) {
  try {
    const { ProxyAgent, fetch } = await import('undici')
    const agent = new ProxyAgent(proxyUrl)
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 saniye timeout
    
    // CoinGecko API'ye basit bir test isteği (ping endpoint)
    const response = await fetch(`${COINGECKO_API}/ping`, {
      dispatcher: agent,
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      const data = await response.text().catch(() => '')
      // CoinGecko ping endpoint'i "gecko_says" döndürür
      if (data.includes('gecko_says') || response.status === 200) {
        return true
      }
    }
    return false
  } catch (error) {
    return false
  }
}

/**
 * Çalışan bir proxy bul (her batch için farklı)
 */
async function getWorkingProxyForBatch(batchIndex, totalBatches) {
  // Proxy listesini hazırla (önce .env'den, sonra ücretsiz proxy'ler)
  let availableProxies = [
    process.env.COINGECKO_PROXY_1 || null,
    process.env.COINGECKO_PROXY_2 || null,
    process.env.COINGECKO_PROXY_3 || null,
    process.env.COINGECKO_PROXY_4 || null,
    process.env.COINGECKO_PROXY_5 || null
  ].filter(Boolean)
  
  // Eğer .env'de proxy yoksa, ücretsiz proxy'leri kullan
  if (availableProxies.length === 0) {
    availableProxies = [...FREE_PROXIES]
  }
  
  // Her batch için farklı proxy seç (round-robin)
  const proxyIndex = batchIndex % availableProxies.length
  let selectedProxy = availableProxies[proxyIndex]
  
  // Eğer seçilen proxy başarısızsa, çalışan bir proxy bul
  if (failedProxies.has(selectedProxy)) {
    // Çalışan proxy'lerden birini seç
    const workingProxyList = availableProxies.filter(p => workingProxies.has(p) && !failedProxies.has(p))
    if (workingProxyList.length > 0) {
      selectedProxy = workingProxyList[batchIndex % workingProxyList.length]
      console.log(`✅ [Proxy] Çalışan proxy seçildi: ${selectedProxy.split('@').pop() || selectedProxy}`)
    } else {
      // Çalışan proxy yok, hızlı test ile çalışan bir proxy bul (max 3 proxy test et)
      let testedCount = 0
      for (const proxy of availableProxies) {
        if (!failedProxies.has(proxy) && testedCount < 3) {
          testedCount++
          console.log(`🔍 [Proxy] Test ediliyor: ${proxy.split('@').pop() || proxy}`)
          const isWorking = await testProxy(proxy)
          if (isWorking) {
            workingProxies.add(proxy)
            selectedProxy = proxy
            console.log(`✅ [Proxy] Çalışan proxy bulundu: ${proxy.split('@').pop() || proxy}`)
            break
          } else {
            failedProxies.add(proxy)
            console.log(`❌ [Proxy] Başarısız: ${proxy.split('@').pop() || proxy}`)
          }
        }
      }
    }
  } else {
    // Proxy'yi test et (ilk kullanımda ve çalışan listede yoksa)
    if (!workingProxies.has(selectedProxy)) {
      console.log(`🔍 [Proxy] İlk kullanım, test ediliyor: ${selectedProxy.split('@').pop() || selectedProxy}`)
      const isWorking = await testProxy(selectedProxy)
      if (isWorking) {
        workingProxies.add(selectedProxy)
        console.log(`✅ [Proxy] Çalışıyor: ${selectedProxy.split('@').pop() || selectedProxy}`)
      } else {
        failedProxies.add(selectedProxy)
        console.log(`❌ [Proxy] Başarısız, alternatif aranıyor: ${selectedProxy.split('@').pop() || selectedProxy}`)
        // Başka bir proxy bul (max 2 alternatif test et)
        let testedCount = 0
        for (const proxy of availableProxies) {
          if (!failedProxies.has(proxy) && proxy !== selectedProxy && testedCount < 2) {
            testedCount++
            console.log(`🔍 [Proxy] Alternatif test ediliyor: ${proxy.split('@').pop() || proxy}`)
            const isWorking = await testProxy(proxy)
            if (isWorking) {
              workingProxies.add(proxy)
              selectedProxy = proxy
              console.log(`✅ [Proxy] Alternatif bulundu: ${proxy.split('@').pop() || proxy}`)
              break
            } else {
              failedProxies.add(proxy)
              console.log(`❌ [Proxy] Alternatif başarısız: ${proxy.split('@').pop() || proxy}`)
            }
          }
        }
      }
    }
  }
  
  return selectedProxy
}

/**
 * Proxy ile fetch yap
 */
async function fetchWithProxy(url, options, proxyUrl) {
  const { fetch, ProxyAgent } = await import('undici')
  
  if (proxyUrl) {
    try {
      const agent = new ProxyAgent(proxyUrl)
      const response = await fetch(url, {
        ...options,
        dispatcher: agent
      })
      return response
    } catch (error) {
      // Proxy hatası, normal fetch dene
      failedProxies.add(proxyUrl)
      workingProxies.delete(proxyUrl)
      return await fetch(url, options)
    }
  } else {
    // Proxy yok, normal fetch
    return await fetch(url, options)
  }
}

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

// Stablecoin kontrolü
function isStablecoin(coin) {
  const id = coin.id?.toLowerCase() || ''
  const symbol = coin.symbol?.toLowerCase() || ''
  const name = coin.name?.toLowerCase() || ''
  
  if (STABLECOIN_IDS.includes(id)) return true
  if (STABLECOIN_SYMBOLS.includes(symbol)) return true
  
  const stablecoinKeywords = [
    'usd', 'usdt', 'usdc', 'dai', 'busd', 'tusd', 'frax', 'usdd', 'lusd', 'fei', 'ust', 'mim',
    'eurs', 'eurt', 'usde', 'pyusd', 'usdf', 'fdusd', 'usds', 'usdg', 'rlusd', 'usyc', 'usd0',
    'usd1', 'usdt0', 'usdtb', 'bfusd', 'susds', 'susde', 'ousg', 'buidl', 'c1usd', 'eurc', 'crvusd',
    'sdai', 'dusd', 'cusdo', 'wstusr', 'usr', 'cusd', 'usda', 'usdo', 'usx', 'usdb', 'fdit',
    'stablecoin', 'stable', 'peg', 'pegged', 'wrapped usd', 'wrapped usdt', 'wrapped usdc',
    'bridged usdt', 'bridged usdc', 'bridged usd', 'staked usd', 'staked usdt', 'staked usdc'
  ]
  
  for (const keyword of stablecoinKeywords) {
    if (name.includes(keyword) || symbol.includes(keyword)) {
      const price = coin.current_price || 0
      if (price >= 0.95 && price <= 1.05) {
        return true
      }
      if (name.includes('usd') || name.includes('usdt') || name.includes('usdc') || 
          name.includes('dai') || name.includes('busd') || name.includes('tusd') ||
          symbol.includes('usd') || symbol.includes('usdt') || symbol.includes('usdc') ||
          symbol.includes('dai') || symbol.includes('busd') || symbol.includes('tusd')) {
        return true
      }
    }
  }
  
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

/**
 * CoinGecko API'den kripto para listesi çek, filtrele ve normalize et
 */
async function fetchCryptoList() {
  try {
    // 5 sayfa sıralı çek (500 coin için - her sayfa 100 coin)
    const pages = [
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Page 1' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=2&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Page 2' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=3&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Page 3' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=4&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Page 4' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=5&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Page 5' }
    ]

    // Sıralı fetch (rate limit'i önlemek için) - Her batch için farklı proxy ile
    let allCoins = []
    let apiStatuses = []
    let retryCount = 0
    const maxRetries = 2
    
    while (allCoins.length === 0 && retryCount <= maxRetries) {
      if (retryCount > 0) {
        // Retry öncesi bekle (exponential backoff)
        const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 10000)
        await new Promise(resolve => setTimeout(resolve, delay))
        console.log(`🔄 CoinGecko API retry attempt ${retryCount}/${maxRetries}...`)
      }
      
      // Sıralı fetch (rate limit'i önlemek için sayfalar arası delay) - Her batch için farklı proxy
      const results = []
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        
        // Sayfalar arası delay (ilk sayfa hariç) - Rate limit'i önlemek için
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000)) // 2 saniye bekle
        }
        
        // Her batch için farklı proxy seç
        const proxyUrl = await getWorkingProxyForBatch(i, pages.length)
        const proxyInfo = proxyUrl ? ` (Proxy: ${proxyUrl.split('@').pop() || proxyUrl})` : ' (No Proxy)'
        console.log(`📡 [Batch ${i + 1}/${pages.length}] Fetching ${page.name}${proxyInfo}`)
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 saniye timeout
          
          const response = await fetchWithProxy(page.url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
          }, proxyUrl)
          
          clearTimeout(timeoutId)
          
          if (!response.ok) {
            // Rate limit hatası (429) - özel handling
            if (response.status === 429) {
              const errorText = await response.text().catch(() => response.statusText)
              console.warn(`⚠️ Rate limit (429) detected for ${page.name}${proxyInfo}, waiting 10 seconds...`)
              // Proxy başarısız olarak işaretle
              if (proxyUrl) {
                failedProxies.add(proxyUrl)
                workingProxies.delete(proxyUrl)
              }
              // Rate limit hatası alındığında 10 saniye bekle
              await new Promise(resolve => setTimeout(resolve, 10000))
              // Farklı bir proxy ile retry yap
              const retryProxy = await getWorkingProxyForBatch(i, pages.length)
              const retryProxyInfo = retryProxy ? ` (Retry Proxy: ${retryProxy.split('@').pop() || retryProxy})` : ' (No Proxy)'
              console.log(`🔄 Retrying ${page.name}${retryProxyInfo}`)
              
              const retryController = new AbortController()
              const retryTimeoutId = setTimeout(() => retryController.abort(), 30000)
              
              const retryResponse = await fetchWithProxy(page.url, {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: retryController.signal
              }, retryProxy)
              
              clearTimeout(retryTimeoutId)
              
              if (!retryResponse.ok) {
                throw new Error(`HTTP ${retryResponse.status}: Rate limit exceeded (retry failed)`)
              }
              
              const retryData = await retryResponse.json()
              results.push({ status: 'fulfilled', value: retryData })
              continue // Başarılı, devam et
            }
            
            // 500 hatası veya diğer hatalar
            if (response.status === 500) {
              const errorText = await response.text().catch(() => response.statusText)
              // HTML dönüyorsa rate limit veya Cloudflare koruması
              if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
                // Proxy başarısız olarak işaretle
                if (proxyUrl) {
                  failedProxies.add(proxyUrl)
                  workingProxies.delete(proxyUrl)
                  console.warn(`⚠️ Proxy başarısız işaretlendi: ${proxyUrl.split('@').pop() || proxyUrl}`)
                }
                throw new Error(`Rate limit or Cloudflare protection (HTTP ${response.status})`)
              }
              throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`)
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const data = await response.json()
          // Başarılı, proxy'yi çalışan olarak işaretle
          if (proxyUrl) {
            workingProxies.add(proxyUrl)
            failedProxies.delete(proxyUrl)
          }
          results.push({ status: 'fulfilled', value: data })
          console.log(`✅ [Batch ${i + 1}/${pages.length}] ${page.name} başarılı${proxyInfo}`)
        } catch (error) {
          // Proxy başarısız olarak işaretle
          if (proxyUrl) {
            failedProxies.add(proxyUrl)
            workingProxies.delete(proxyUrl)
          }
          results.push({ status: 'rejected', reason: error })
        }
      }

      // Başarılı sonuçları topla
      allCoins = []
      apiStatuses = []

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (Array.isArray(result.value)) {
            allCoins.push(...result.value)
            apiStatuses.push({ name: pages[index].name, success: true })
          } else {
            apiStatuses.push({ name: pages[index].name, success: false, error: 'Invalid response format' })
          }
        } else {
          const errorMsg = result.reason?.message || 'Failed to fetch'
          apiStatuses.push({ name: pages[index].name, success: false, error: errorMsg })
          console.error(`❌ ${pages[index].name} error:`, errorMsg)
        }
      })
      
      // Eğer en az bir sayfa başarılı olduysa, devam et
      if (allCoins.length > 0) {
        break
      }
      
      retryCount++
    }

    if (allCoins.length === 0) {
      const errorDetails = apiStatuses.map(s => `${s.name}: ${s.error || 'OK'}`).join(', ')
      throw new Error(`No data received from CoinGecko API after ${maxRetries + 1} attempts. Details: ${errorDetails}`)
    }

    // Duplicate coin'leri filtrele
    const uniqueCoinsMap = new Map()
    allCoins.forEach(coin => {
      if (!uniqueCoinsMap.has(coin.id)) {
        uniqueCoinsMap.set(coin.id, coin)
      }
    })
    const uniqueData = Array.from(uniqueCoinsMap.values())

    // Stablecoin'leri filtrele
    const filteredData = uniqueData.filter(coin => !isStablecoin(coin))

    // 500 coin'e sınırla ve market_cap_rank'i düzelt
    const limitedData = filteredData.slice(0, 500)

    // Normalize et ve market_cap_rank'i düzelt (1'den başlayarak)
    const normalizedData = limitedData.map((coin, index) => ({
      id: coin.id,
      name: coin.name,
      symbol: coin.symbol,
      image: coin.image,
      current_price: coin.current_price || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      market_cap: coin.market_cap || 0,
      market_cap_rank: index + 1, // Yeniden numaralandır
      circulating_supply: coin.circulating_supply || 0,
      total_volume: coin.total_volume || 0,
      sparkline_in_7d: coin.sparkline_in_7d?.price || [],
      supply_absolute_change_24h: coin.circulating_supply ? (coin.circulating_supply * 0.01) : 0
    }))

    return {
      data: normalizedData,
      apiStatuses
    }
  } catch (error) {
    throw new Error(`CoinGecko API error: ${error.message}`)
  }
}

/**
 * CoinGecko API'den OHLC verisi çek
 */
async function fetchOHLCData(coinId, days = 1) {
  try {
    const { fetch } = await import('undici')
    
    const response = await fetch(
      `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      {
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(30000) // 30 saniye timeout
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!Array.isArray(data)) {
      throw new Error('Invalid OHLC data format')
    }

    return data
  } catch (error) {
    throw new Error(`CoinGecko OHLC error: ${error.message}`)
  }
}

export { fetchCryptoList, fetchOHLCData }

