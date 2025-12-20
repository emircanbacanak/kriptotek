const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Geniş aralıkta benzersiz proxy listesi (farklı IP aralıkları ve portlar)
// Not: Bu proxy'ler otomatik olarak test edilir, çalışanlar kullanılır
const FREE_PROXIES = [
  // 103.152.x.x aralığı
  'http://103.152.112.1:80', 'http://103.152.112.1:8080', 'http://103.152.112.1:3128',
  'http://103.152.112.2:80', 'http://103.152.112.2:8080', 'http://103.152.112.2:3128',
  'http://103.152.112.3:80', 'http://103.152.112.3:8080', 'http://103.152.112.3:3128',
  'http://103.152.112.4:80', 'http://103.152.112.4:8080', 'http://103.152.112.4:3128',
  'http://103.152.112.5:80', 'http://103.152.112.5:8080', 'http://103.152.112.5:3128',
  'http://103.152.112.6:80', 'http://103.152.112.6:8080', 'http://103.152.112.6:3128',
  'http://103.152.112.7:80', 'http://103.152.112.7:8080', 'http://103.152.112.7:3128',
  'http://103.152.112.8:80', 'http://103.152.112.8:8080', 'http://103.152.112.8:3128',
  'http://103.152.112.9:80', 'http://103.152.112.9:8080', 'http://103.152.112.9:3128',
  'http://103.152.112.10:80', 'http://103.152.112.10:8080', 'http://103.152.112.10:3128',

  // 185.199.x.x aralığı
  'http://185.199.108.1:80', 'http://185.199.108.1:8080', 'http://185.199.108.1:3128',
  'http://185.199.108.2:80', 'http://185.199.108.2:8080', 'http://185.199.108.2:3128',
  'http://185.199.108.3:80', 'http://185.199.108.3:8080', 'http://185.199.108.3:3128',
  'http://185.199.108.4:80', 'http://185.199.108.4:8080', 'http://185.199.108.4:3128',
  'http://185.199.108.5:80', 'http://185.199.108.5:8080', 'http://185.199.108.5:3128',
  'http://185.199.108.6:80', 'http://185.199.108.6:8080', 'http://185.199.108.6:3128',
  'http://185.199.108.7:80', 'http://185.199.108.7:8080', 'http://185.199.108.7:3128',
  'http://185.199.108.8:80', 'http://185.199.108.8:8080', 'http://185.199.108.8:3128',
  'http://185.199.108.9:80', 'http://185.199.108.9:8080', 'http://185.199.108.9:3128',
  'http://185.199.108.10:80', 'http://185.199.108.10:8080', 'http://185.199.108.10:3128',

  // 192.169.x.x aralığı
  'http://192.169.1.1:80', 'http://192.169.1.1:8080', 'http://192.169.1.1:3128',
  'http://192.169.1.2:80', 'http://192.169.1.2:8080', 'http://192.169.1.2:3128',
  'http://192.169.1.3:80', 'http://192.169.1.3:8080', 'http://192.169.1.3:3128',
  'http://192.169.1.4:80', 'http://192.169.1.4:8080', 'http://192.169.1.4:3128',
  'http://192.169.1.5:80', 'http://192.169.1.5:8080', 'http://192.169.1.5:3128',
  'http://192.169.1.6:80', 'http://192.169.1.6:8080', 'http://192.169.1.6:3128',
  'http://192.169.1.7:80', 'http://192.169.1.7:8080', 'http://192.169.1.7:3128',
  'http://192.169.1.8:80', 'http://192.169.1.8:8080', 'http://192.169.1.8:3128',
  'http://192.169.1.9:80', 'http://192.169.1.9:8080', 'http://192.169.1.9:3128',
  'http://192.169.1.10:80', 'http://192.169.1.10:8080', 'http://192.169.1.10:3128',

  // 104.21.x.x aralığı
  'http://104.21.1.1:80', 'http://104.21.1.1:8080', 'http://104.21.1.1:3128',
  'http://104.21.1.2:80', 'http://104.21.1.2:8080', 'http://104.21.1.2:3128',
  'http://104.21.1.3:80', 'http://104.21.1.3:8080', 'http://104.21.1.3:3128',
  'http://104.21.1.4:80', 'http://104.21.1.4:8080', 'http://104.21.1.4:3128',
  'http://104.21.1.5:80', 'http://104.21.1.5:8080', 'http://104.21.1.5:3128',
  'http://104.21.1.6:80', 'http://104.21.1.6:8080', 'http://104.21.1.6:3128',
  'http://104.21.1.7:80', 'http://104.21.1.7:8080', 'http://104.21.1.7:3128',
  'http://104.21.1.8:80', 'http://104.21.1.8:8080', 'http://104.21.1.8:3128',
  'http://104.21.1.9:80', 'http://104.21.1.9:8080', 'http://104.21.1.9:3128',
  'http://104.21.1.10:80', 'http://104.21.1.10:8080', 'http://104.21.1.10:3128',
]

/**
 * Array'i karıştır (Fisher-Yates shuffle)
 */
function shuffleArray(array) {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/**
 * Proxy ile fetch yap (proxy başarısız olursa random olarak diğer proxy'leri dene)
 */
async function fetchWithProxy(url, options, startProxyIndex = 0) {
  const { fetch, ProxyAgent } = await import('undici')
  const availableProxies = [...FREE_PROXIES]

  // Önce proxy olmadan dene (en hızlı yol)
  try {
    const directResponse = await fetch(url, options)
    if (directResponse && (directResponse.ok || directResponse.status !== 429)) {
      return directResponse
    }
  } catch (directError) {
    // Direkt fetch başarısız, proxy'lerle devam et
  }

  // Proxy'leri random sırayla dene (karışık kullan)
  const maxProxiesToTry = Math.min(30, availableProxies.length) // En fazla 30 proxy dene
  const shuffledProxies = shuffleArray(availableProxies).slice(0, maxProxiesToTry)

  for (let i = 0; i < shuffledProxies.length; i++) {
    const proxyUrl = shuffledProxies[i]

    try {
      const agent = new ProxyAgent(proxyUrl)
      const response = await fetch(url, {
        ...options,
        dispatcher: agent
      })

      // Başarılı response alındıysa bu proxy'yi kullan
      if (response && (response.ok || response.status !== 429)) {
        return response
      }

      // Rate limit (429) alındıysa bir sonraki random proxy'yi dene
      if (response && response.status === 429) {
        continue
      }

      return response
    } catch (error) {
      // Bu proxy çalışmıyor, bir sonraki random proxy'yi dene
      continue
    }
  }

  // Hiçbir proxy çalışmadı, normal fetch dene
  return await fetch(url, options)
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
    // İlk 3 batch çek (540 coin için - her batch 180 coin) - MEMORY OPTIMIZED
    // CoinGecko API maksimum per_page=250 destekliyor, biz 180 kullanıyoruz
    // 3 batch x 180 coin = 540 coin (memory azaltma için 615'ten düşürüldü)
    let pages = [
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=180&page=1&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Batch 1 (180 coin)' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=180&page=2&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Batch 2 (180 coin)' },
      { url: `${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=180&page=3&sparkline=true&price_change_percentage=24h`, name: 'CoinGecko Batch 3 (180 coin)' }
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
          await new Promise(resolve => setTimeout(resolve, 3000)) // 3 saniye bekle (artırıldı)
        }

        // Her batch için farklı proxy seç
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 saniye timeout

          const response = await fetchWithProxy(page.url, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
          }, i)

          clearTimeout(timeoutId)

          if (!response.ok) {
            // Rate limit hatası (429) - özel handling
            if (response.status === 429) {
              const errorText = await response.text().catch(() => response.statusText)
              console.warn(`⚠️ Rate limit (429) detected for ${page.name}, waiting 30 seconds...`)
              // Rate limit hatası alındığında 30 saniye bekle (daha uzun bekleme)
              await new Promise(resolve => setTimeout(resolve, 30000))
              // Farklı bir proxy ile retry yap (bir sonraki proxy index'i)
              console.log(`🔄 Retrying ${page.name} (trying next proxy)`)

              const retryController = new AbortController()
              const retryTimeoutId = setTimeout(() => retryController.abort(), 60000)

              const retryResponse = await fetchWithProxy(page.url, {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: retryController.signal
              }, i + 1)

              clearTimeout(retryTimeoutId)

              if (!retryResponse.ok) {
                // Retry de başarısız oldu, bu sayfayı atla
                console.warn(`⚠️ Retry failed for ${page.name}, skipping this page`)
                results.push({ status: 'rejected', reason: new Error(`HTTP ${retryResponse.status}: Rate limit exceeded (retry failed)`) })
                continue
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
                throw new Error(`Rate limit or Cloudflare protection (HTTP ${response.status})`)
              }
              throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 100)}`)
            }

            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const data = await response.json()
          results.push({ status: 'fulfilled', value: data })
        } catch (error) {
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
    let uniqueData = Array.from(uniqueCoinsMap.values())

    // Stablecoin'leri filtrele
    let filteredData = uniqueData.filter(coin => !isStablecoin(coin))

    console.log(`📊 İlk 3 batch sonrası: ${uniqueData.length} unique coin, ${filteredData.length} coin (stablecoin'ler filtrelendi)`)

    // 3 batch x 195 coin = 615 coin hedefleniyor
    // Ek sayfa çekme mantığı kaldırıldı - 3 batch yeterli

    // 615 coin'e sınırla (3 batch x 195 coin) ve market_cap_rank'i düzelt
    const limitedData = filteredData.slice(0, 615)

    // Eğer hala 615'ten az coin varsa, uyarı ver
    if (limitedData.length < 615) {
      console.warn(`⚠️ UYARI: Sadece ${limitedData.length} coin çekilebildi (615 hedeflendi - 3 batch x 195 coin).`)
    } else {
      console.log(`✅ Başarılı: ${limitedData.length} coin çekildi (615 hedeflendi - 3 batch x 195 coin)`)
    }

    console.log(`📊 Final coin sayısı: ${limitedData.length} coin (615 hedeflendi - 3 batch x 195 coin)`)

    // Tüm 615 coin için detaylı bilgi çek (total_supply ve max_supply için)
    const allCoinIds = limitedData.map(coin => coin.id)

    let supplyDataMap = new Map()

    // Önce mevcut API response'undan gelen verileri kontrol et
    // CoinGecko /coins/markets endpoint'i total_supply ve max_supply döndürebilir
    let foundInMarkets = 0
    allCoins.forEach(coin => {
      // total_supply veya max_supply varsa kullan
      if ((coin.total_supply !== null && coin.total_supply !== undefined) ||
        (coin.max_supply !== null && coin.max_supply !== undefined)) {
        supplyDataMap.set(coin.id, {
          total_supply: coin.total_supply !== null && coin.total_supply !== undefined ? coin.total_supply : null,
          max_supply: coin.max_supply !== null && coin.max_supply !== undefined ? coin.max_supply : null
        })
        foundInMarkets++
      }
    })

    console.log(`📊 Mevcut API response'undan ${foundInMarkets} coin için supply bilgisi bulundu (toplam ${allCoins.length} coin)`)


    // Eğer hiç supply bilgisi yoksa, tüm coin'ler için detaylı bilgi çek
    if (supplyDataMap.size === 0) {
      console.log(`⚠️ Mevcut API response'unda supply bilgisi yok, tüm coin'ler için detaylı bilgi çekilecek`)
    }

    // Eksik olan coin'ler için /coins/{id} endpoint'ini kullan
    // Top 615 coin için supply bilgileri çekiliyor (anasayfadaki filtrelenmiş 615 coin - 3 batch x 195)
    const missingCoins = allCoinIds.filter(id => !supplyDataMap.has(id))
    const coinsToFetch = missingCoins.slice(0, 615) // Top 615 coin için supply bilgisi

    if (coinsToFetch.length > 0) {
      console.log(`📊 ${coinsToFetch.length} coin için supply bilgisi eksik (top ${coinsToFetch.length} coin), detaylı bilgi çekiliyor...`)

      try {
        // Batch'ler halinde çek (rate limit için)
        // CoinGecko API: /coins/{id} endpoint'i tek coin için, batch endpoint yok
        // Rate limit: Ücretsiz plan 5-15 çağrı/dakika
        // Paralel işlem yaparak hızlandırıyoruz (her batch'te 20 coin paralel)
        const batchSize = 250 // CoinGecko /coins/markets max 250 coin, batch size'ı buna yakın tutuyoruz
        const parallelLimit = 20 // Her batch'te paralel çalışacak coin sayısı (rate limit için)
        const batches = []
        for (let i = 0; i < coinsToFetch.length; i += batchSize) {
          batches.push(coinsToFetch.slice(i, i + batchSize))
        }

        // Timeout'u azalttık - daha hızlı tamamlanması için
        // Maksimum 10 dakika (600 saniye) - yeterli süre
        const maxTime = 600000 // 10 dakika
        const startTime = Date.now()
        const initialSupplySize = supplyDataMap.size // Başlangıçtaki supply data sayısı (mevcut API response'undan gelenler)
        const failedCoins = [] // Başarısız coin'leri tutmak için

        console.log(`📊 ${batches.length} batch oluşturuldu (her batch ${batchSize} coin, ${parallelLimit} paralel), toplam ${coinsToFetch.length} coin çekilecek`)

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          // Timeout kontrolü (sadece güvenlik için, normalde tüm coin'ler çekilmeli)
          if (Date.now() - startTime > maxTime) {
            console.warn(`⚠️ Supply bilgileri çekme işlemi timeout oldu (${batchIndex}/${batches.length} batch tamamlandı, ${batchIndex * batchSize} coin)`)
            break
          }

          const batch = batches[batchIndex]
          const batchStartSize = supplyDataMap.size // Batch başlangıcındaki supply data sayısı

          // Her batch arasında 1 saniye bekle (rate limit için - hız için azaltıldı)
          if (batchIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }

          // Paralel işlem: Her batch'te parallelLimit kadar coin'i aynı anda çek
          for (let i = 0; i < batch.length; i += parallelLimit) {
            const parallelBatch = batch.slice(i, i + parallelLimit)

            // Paralel fetch işlemleri
            const parallelPromises = parallelBatch.map(async (coinId, coinIndex) => {
              let success = false
              let retryCount = 0
              const maxRetries = 1 // Hız için retry sayısını azalttık (2 → 1)
              let coinFailed = false

              while (!success && retryCount <= maxRetries) {
                try {
                  const supplyUrl = `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`

                  // Her retry'de farklı proxy index kullan
                  const proxyStartIndex = (batchIndex * batch.length + i + coinIndex + retryCount) % FREE_PROXIES.length

                  if (retryCount > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000)) // Retry arasında 1 saniye bekle
                  }

                  const controller = new AbortController()
                  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 saniye timeout

                  try {
                    const supplyResponse = await fetchWithProxy(supplyUrl, {
                      headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                      },
                      signal: controller.signal
                    }, proxyStartIndex)

                    clearTimeout(timeoutId)

                    if (supplyResponse && supplyResponse.ok) {
                      const coinData = await supplyResponse.json()
                      if (coinData && coinData.market_data) {
                        const marketData = coinData.market_data
                        const totalSupply = marketData.total_supply !== null && marketData.total_supply !== undefined ? marketData.total_supply : null
                        const maxSupply = marketData.max_supply !== null && marketData.max_supply !== undefined ? marketData.max_supply : null

                        // Sadece null değilse kaydet (0 değerleri de geçerli)
                        if (totalSupply !== null || maxSupply !== null) {
                          supplyDataMap.set(coinId, {
                            total_supply: totalSupply,
                            max_supply: maxSupply
                          })
                          success = true
                        } else {
                          success = true // Başarılı ama supply yok
                        }
                      } else {
                        success = true // Başarılı ama market_data yok
                      }
                    } else if (supplyResponse && supplyResponse.status === 429) {
                      // Rate limit hatası - daha kısa bekle (hız için)
                      if (retryCount === 0) {
                        await new Promise(resolve => setTimeout(resolve, 20000)) // 20 saniye bekle
                      }
                      retryCount++
                      continue
                    } else {
                      // HTTP hatası - sessizce retry yap
                      retryCount++
                      continue
                    }
                  } catch (fetchError) {
                    clearTimeout(timeoutId)
                    if (fetchError.name !== 'AbortError') {
                      retryCount++
                      continue
                    }
                    // Timeout - sessizce atla
                    retryCount++
                    continue
                  }
                } catch (error) {
                  // Hata durumunda retry yap - sessizce
                  retryCount++
                  if (retryCount > maxRetries) {
                    // Başarısız coin'i kaydet
                    if (!failedCoins.includes(coinId)) {
                      failedCoins.push(coinId)
                    }
                  }
                }
              }

              // Eğer hiç başarılı olamadıysa, başarısız coin'leri kaydet
              if (!success && retryCount > maxRetries) {
                if (!failedCoins.includes(coinId)) {
                  failedCoins.push(coinId)
                }
              }
            })

            // Paralel batch'i bekle
            await Promise.all(parallelPromises)

            // Paralel batch'ler arasında kısa bekleme (rate limit için)
            if (i + parallelLimit < batch.length) {
              await new Promise(resolve => setTimeout(resolve, 500)) // 0.5 saniye bekleme
            }
          }

          // Bu batch'te çekilen coin sayısı (batch başlangıcından sonra eklenenler)
          const batchCompletedCoins = supplyDataMap.size - batchStartSize
          // Toplam tamamlanan coin sayısı (başlangıçtan itibaren çekilenler, mevcut API response'undan gelenler hariç)
          const totalCompletedCoins = supplyDataMap.size - initialSupplySize
          const progress = totalCompletedCoins > 0 ? ((totalCompletedCoins / coinsToFetch.length) * 100).toFixed(1) : '0.0'
          console.log(`✅ Batch ${batchIndex + 1}/${batches.length} tamamlandı (bu batch: ${batchCompletedCoins}/${batch.length} coin, toplam: ${totalCompletedCoins}/${coinsToFetch.length} coin - %${progress})`)
        }

        // Başarısız coin'leri tekrar dene
        if (failedCoins.length > 0) {
          console.log(`🔄 ${failedCoins.length} başarısız coin için retry yapılıyor...`)

          const retryPromises = failedCoins.map(async (coinId) => {
            let success = false
            let retryCount = 0
            const maxRetries = 2 // Retry'de daha fazla deneme yap

            while (!success && retryCount <= maxRetries) {
              try {
                const supplyUrl = `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`

                // Her retry'de farklı proxy index kullan
                const proxyStartIndex = (retryCount * 10) % FREE_PROXIES.length

                if (retryCount > 0) {
                  await new Promise(resolve => setTimeout(resolve, 2000)) // Retry arasında 2 saniye bekle
                }

                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 15000) // Retry'de daha uzun timeout

                try {
                  const supplyResponse = await fetchWithProxy(supplyUrl, {
                    headers: {
                      'Accept': 'application/json',
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    signal: controller.signal
                  }, proxyStartIndex)

                  clearTimeout(timeoutId)

                  if (supplyResponse && supplyResponse.ok) {
                    const coinData = await supplyResponse.json()
                    if (coinData && coinData.market_data) {
                      const marketData = coinData.market_data
                      const totalSupply = marketData.total_supply !== null && marketData.total_supply !== undefined ? marketData.total_supply : null
                      const maxSupply = marketData.max_supply !== null && marketData.max_supply !== undefined ? marketData.max_supply : null

                      if (totalSupply !== null || maxSupply !== null) {
                        supplyDataMap.set(coinId, {
                          total_supply: totalSupply,
                          max_supply: maxSupply
                        })
                        success = true
                      } else {
                        success = true // Başarılı ama supply yok
                      }
                    } else {
                      success = true // Başarılı ama market_data yok
                    }
                  } else if (supplyResponse && supplyResponse.status === 429) {
                    // Rate limit hatası
                    if (retryCount === 0) {
                      await new Promise(resolve => setTimeout(resolve, 30000)) // 30 saniye bekle
                    }
                    retryCount++
                    continue
                  } else {
                    retryCount++
                    continue
                  }
                } catch (fetchError) {
                  clearTimeout(timeoutId)
                  retryCount++
                  continue
                }
              } catch (error) {
                retryCount++
                if (retryCount > maxRetries) {
                  // Son retry de başarısız
                }
              }
            }
          })

          // Retry işlemlerini paralel yap (daha az paralel - rate limit için)
          const retryParallelLimit = 10
          for (let i = 0; i < retryPromises.length; i += retryParallelLimit) {
            const retryBatch = retryPromises.slice(i, i + retryParallelLimit)
            await Promise.all(retryBatch)

            // Retry batch'ler arasında bekleme
            if (i + retryParallelLimit < retryPromises.length) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
          }

          const retrySuccessCount = failedCoins.filter(coinId => supplyDataMap.has(coinId)).length
          const retryFailedCount = failedCoins.length - retrySuccessCount
          console.log(`✅ Retry tamamlandı: ${retrySuccessCount} başarılı, ${retryFailedCount} başarısız`)
        }

        if (supplyDataMap.size > 0) {
        }
      } catch (error) {
        console.warn(`⚠️ Supply bilgileri çekilirken genel hata: ${error.message}`)
      }
    } else {
      console.log(`✅ Tüm coin'ler için supply bilgileri mevcut (${supplyDataMap.size} coin)`)
    }

    if (missingCoins.length > 615) {
      console.log(`ℹ️ ${missingCoins.length - 615} coin için supply bilgisi çekilmedi (sadece top 615 coin çekildi - 3 batch x 195)`)
    }

    // Normalize et ve market_cap_rank'i düzelt (1'den başlayarak)
    const normalizedData = limitedData.map((coin, index) => {
      const supplyInfo = supplyDataMap.get(coin.id)

      // Supply bilgilerini öncelik sırasına göre belirle
      let totalSupply = null
      let maxSupply = null

      if (supplyInfo) {
        // supplyDataMap'ten gelen bilgiyi kullan
        totalSupply = supplyInfo.total_supply !== undefined ? supplyInfo.total_supply : null
        maxSupply = supplyInfo.max_supply !== undefined ? supplyInfo.max_supply : null
      } else {
        // Fallback: coin objesinden gelen bilgiyi kullan
        totalSupply = coin.total_supply !== null && coin.total_supply !== undefined ? coin.total_supply : null
        maxSupply = coin.max_supply !== null && coin.max_supply !== undefined ? coin.max_supply : null
      }

      return {
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol,
        image: coin.image,
        current_price: coin.current_price || 0,
        price_change_percentage_24h: coin.price_change_percentage_24h || 0,
        market_cap: coin.market_cap || 0,
        market_cap_rank: index + 1, // Yeniden numaralandır
        circulating_supply: coin.circulating_supply || 0,
        total_supply: totalSupply,
        max_supply: maxSupply,
        total_volume: coin.total_volume || 0,
        sparkline_in_7d: coin.sparkline_in_7d?.price || [],
        supply_absolute_change_24h: coin.circulating_supply ? (coin.circulating_supply * 0.01) : 0
      }
    })

    return {
      data: normalizedData,
      apiStatuses
    }
  } catch (error) {
    throw new Error(`CoinGecko API error: ${error.message}`)
  }
}

/**
 * CoinId'ye göre benzersiz proxy index'i hesapla (hash fonksiyonu)
 */
function getProxyIndexForCoin(coinId) {
  // Basit bir hash fonksiyonu: coinId'yi string'e çevirip karakterlerini topla
  let hash = 0
  const coinIdStr = String(coinId)
  for (let i = 0; i < coinIdStr.length; i++) {
    const char = coinIdStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // 32-bit integer'a dönüştür
  }
  // Mutlak değer al ve proxy listesi uzunluğuna göre mod al
  return Math.abs(hash) % FREE_PROXIES.length
}

/**
 * CoinGecko API'den OHLC verisi çek (her coin için benzersiz proxy ile, retry mekanizması ile)
 */
async function fetchOHLCData(coinId, days = 1) {
  try {
    const { fetch, ProxyAgent } = await import('undici')

    const url = `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
    const maxProxyRetries = Math.min(15, FREE_PROXIES.length) // En fazla 15 farklı proxy dene

    // CoinId'ye göre benzersiz başlangıç proxy index'i
    const startProxyIndex = getProxyIndexForCoin(coinId)

    // Önce proxy'lerle dene (her coin için farklı proxy'ler)
    for (let attempt = 0; attempt < maxProxyRetries && attempt < FREE_PROXIES.length; attempt++) {
      const proxyIndex = (startProxyIndex + attempt) % FREE_PROXIES.length
      const selectedProxy = FREE_PROXIES[proxyIndex]

      try {
        const agent = new ProxyAgent(selectedProxy)
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          dispatcher: agent,
          signal: AbortSignal.timeout(30000) // 30 saniye timeout
        })

        if (response && response.ok) {
          const data = await response.json()
          if (Array.isArray(data)) {
            console.log(`✅ OHLC data fetched for ${coinId} via proxy ${selectedProxy} (attempt ${attempt + 1})`)
            return data
          }
        }

        // 429 hatası alındıysa bir sonraki proxy'yi dene
        if (response && response.status === 429) {
          console.warn(`⚠️ 429 error for ${coinId} via proxy ${selectedProxy}, trying next proxy...`)
          continue
        }

        // Diğer hatalar için de bir sonraki proxy'yi dene
        if (response && !response.ok) {
          console.warn(`⚠️ HTTP ${response.status} for ${coinId} via proxy ${selectedProxy}, trying next proxy...`)
          continue
        }
      } catch (proxyError) {
        // Proxy hatası, bir sonraki proxy'yi dene
        console.warn(`⚠️ Proxy ${selectedProxy} failed for ${coinId} (attempt ${attempt + 1}): ${proxyError.message}`)
        continue
      }
    }

    // Tüm proxy'ler başarısız olduysa hata fırlat (normal fetch kullanma, zaten 429 veriyor)
    throw new Error(`All ${maxProxyRetries} proxies failed for ${coinId}. Cannot fetch OHLC data.`)
  } catch (error) {
    throw new Error(`CoinGecko OHLC error: ${error.message}`)
  }
}

export { fetchCryptoList, fetchOHLCData }