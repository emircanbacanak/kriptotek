/**
 * Fear & Greed Index Handler
 * CoinStats API'den Fear & Greed Index verilerini çeker
 */

const COINSTATS_API = 'https://openapiv1.coinstats.app'
const ALTERNATIVE_ME_API = 'https://api.alternative.me/fng/' // Fallback API

// Ücretsiz proxy listesi (otomatik kullanılacak)
// Not: Ücretsiz proxy'ler genellikle güvenilir değildir, çalışmazsa normal fetch kullanılır
const FREE_PROXIES = [
  // Public proxy'ler (örnekler - gerçek proxy'ler dinamik olarak güncellenebilir)
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
  'http://103.99.8.0:80',
  'http://103.99.9.0:80',
  'http://103.99.10.0:80',
  'http://103.99.11.0:80',
  // Daha fazla proxy eklenebilir
]

// Proxy listesi (önce .env'den, sonra ücretsiz proxy'ler)
let currentProxyIndex = 0
let PROXIES = [
  process.env.FEAR_GREED_PROXY_1 || null,
  process.env.FEAR_GREED_PROXY_2 || null
].filter(Boolean)

// Eğer .env'de proxy yoksa, ücretsiz proxy'leri kullan
if (PROXIES.length === 0) {
  PROXIES = [...FREE_PROXIES]
}

// Çalışmayan proxy'leri takip et
const failedProxies = new Set()

/**
 * Çalışan bir proxy bul (başarısız olanları atla)
 */
function getNextWorkingProxy() {
  if (PROXIES.length === 0) return null
  
  // Çalışan proxy bul
  let attempts = 0
  while (attempts < PROXIES.length) {
    const proxy = PROXIES[currentProxyIndex]
    currentProxyIndex = (currentProxyIndex + 1) % PROXIES.length
    
    if (!failedProxies.has(proxy)) {
      return proxy
    }
    attempts++
  }
  
  // Tüm proxy'ler başarısız, listeyi temizle ve tekrar dene
  if (failedProxies.size >= PROXIES.length) {
    failedProxies.clear()
    return PROXIES[0]
  }
  
  return null
}

/**
 * Proxy ile fetch yap (timeout ile) - undici kullanarak
 */
async function fetchWithProxyTimeout(url, options, proxyUrl, timeout = 10000) {
  if (!proxyUrl) {
    // Proxy yok, normal fetch (undici)
    const { fetch } = await import('undici')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  try {
    const { fetch, ProxyAgent } = await import('undici')
    const { HttpsProxyAgent } = await import('https-proxy-agent')
    
    // Proxy agent oluştur
    let dispatcher = null
    
    // undici ProxyAgent kullan (daha iyi destek)
    try {
      dispatcher = new ProxyAgent(proxyUrl)
    } catch (proxyError) {
      // ProxyAgent başarısız, https-proxy-agent dene
      const agent = new HttpsProxyAgent(proxyUrl)
      // undici agent'ı kabul etmiyor, normal fetch'e dön
      throw new Error('Proxy agent oluşturulamadı')
    }
    
    // Timeout ile fetch
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        dispatcher: dispatcher
      })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    // Proxy hatası, null döndür (normal fetch denenir)
    return null
  }
}

/**
 * CoinStats API'den Fear & Greed Index verilerini çek (proxy ile)
 */
async function fetchFearGreedData(apiKey) {
  if (!apiKey) {
    throw new Error('CoinStats API key eksik')
  }

  const maxRetries = PROXIES.length > 0 ? Math.min(5, PROXIES.length + 1) : 2
  let lastError = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Proxy seç (çalışan birini bul)
      const proxyUrl = getNextWorkingProxy()
      
      let response = null
      
      // Önce proxy ile dene (varsa)
      if (proxyUrl) {
        try {
          response = await fetchWithProxyTimeout(
            `${COINSTATS_API}/insights/fear-and-greed`,
            {
              headers: {
                'X-API-KEY': apiKey,
                'Accept': 'application/json'
              }
            },
            proxyUrl,
            8000 // 8 saniye timeout
          )
          
          // Proxy başarısız olduysa işaretle
          if (!response) {
            failedProxies.add(proxyUrl)
            if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
              console.log(`⚠️ Proxy başarısız, atlanıyor: ${proxyUrl}`)
            }
          }
        } catch (proxyError) {
          // Proxy hatası, işaretle
          failedProxies.add(proxyUrl)
          if (import.meta.env?.DEV || process.env.NODE_ENV === 'development') {
            console.log(`⚠️ Proxy hatası: ${proxyUrl} - ${proxyError.message}`)
          }
        }
      }
      
      // Proxy çalışmadıysa veya proxy yoksa, normal fetch dene (undici)
      if (!response || !response.ok) {
        const { fetch } = await import('undici')
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 saniye timeout
        
        try {
          response = await fetch(`${COINSTATS_API}/insights/fear-and-greed`, {
            headers: {
              'X-API-KEY': apiKey,
              'Accept': 'application/json'
            },
            signal: controller.signal
          })
          clearTimeout(timeoutId)
        } catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      }

      if (!response.ok) {
        // CoinStats API hatası, Alternative.me API'yi dene (fallback)
        if (response.status === 500 || response.status >= 500) {
          console.log(`⚠️ CoinStats API ${response.status} hatası, Alternative.me API deneniyor...`)
          
          try {
            const { fetch } = await import('undici')
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000)
            
            try {
              const fallbackResponse = await fetch(ALTERNATIVE_ME_API, {
                headers: {
                  'Accept': 'application/json'
                },
                signal: controller.signal
              })
              clearTimeout(timeoutId)
              
              if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json()
                if (fallbackData && fallbackData.data && fallbackData.data.length > 0) {
                  const latest = fallbackData.data[0]
                  return {
                    value: parseInt(latest.value) || null,
                    classification: latest.value_classification || null,
                    timestamp: parseInt(latest.timestamp) * 1000 || Date.now(),
                    timeUntilUpdate: parseInt(latest.time_until_update) || null
                  }
                }
              }
            } catch (fetchError) {
              clearTimeout(timeoutId)
              throw fetchError
            }
          } catch (fallbackError) {
            // Fallback de başarısız
            throw new Error(`CoinStats API error: ${response.status}, Alternative.me fallback de başarısız: ${fallbackError.message}`)
          }
        }
        
        throw new Error(`CoinStats API error: ${response.status}`)
      }

      const data = await response.json()

      if (!data || !data.now || data.now.value === undefined || data.now.value === null) {
        // CoinStats'tan veri yok, Alternative.me API'yi dene (fallback)
        console.log(`⚠️ CoinStats API'den veri bulunamadı, Alternative.me API deneniyor...`)
        
        try {
          const { fetch } = await import('undici')
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)
          
          try {
            const fallbackResponse = await fetch(ALTERNATIVE_ME_API, {
              headers: {
                'Accept': 'application/json'
              },
              signal: controller.signal
            })
            clearTimeout(timeoutId)
            
            if (fallbackResponse.ok) {
              const fallbackData = await fallbackResponse.json()
              if (fallbackData && fallbackData.data && fallbackData.data.length > 0) {
                const latest = fallbackData.data[0]
                return {
                  value: parseInt(latest.value) || null,
                  classification: latest.value_classification || null,
                  timestamp: parseInt(latest.timestamp) * 1000 || Date.now(),
                  timeUntilUpdate: parseInt(latest.time_until_update) || null
                }
              }
            }
          } catch (fetchError) {
            clearTimeout(timeoutId)
            throw fetchError
          }
        } catch (fallbackError) {
          // Fallback de başarısız
          throw new Error('CoinStats API: Fear & Greed verisi bulunamadı, Alternative.me fallback de başarısız')
        }
        
        throw new Error('CoinStats API: Fear & Greed verisi bulunamadı')
      }

      // Başarılı! Başarısız proxy listesini temizle (belki şimdi çalışıyordur)
      if (proxyUrl && failedProxies.has(proxyUrl)) {
        failedProxies.delete(proxyUrl)
      }

      return {
        value: parseInt(data.now.value) || null,
        classification: data.now.value_classification || null,
        timestamp: Date.now(),
        timeUntilUpdate: data.now.time_until_update || null
      }
    } catch (error) {
      lastError = error
      if (attempt < maxRetries - 1) {
        // Sonraki denemeye geç (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }
  }

  throw new Error(`CoinStats API error: ${lastError?.message || 'Tüm proxy\'ler ve normal fetch başarısız oldu'}`)
}

export { fetchFearGreedData }

