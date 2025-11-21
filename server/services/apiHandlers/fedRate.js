export async function fetchFedRateData() {
  const FRED_API_KEY = process.env.FRED_API_KEY
  
  console.log('🔍 Fed Rate: Veri çekiliyor...')
  
  let announcedUpper = null
  let announcedLower = null
  let previousUpper = null
  let previousLower = null
  let lastAnnounceDate = null
  let nextDecisionDate = null
  
  // 1. FRED API'den mevcut ve önceki oranları çek
  if (FRED_API_KEY) {
    try {
      console.log('📊 FRED API\'den veri çekiliyor...')
      
      const fredParams = `api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=50`
      
      // Upper ve Lower'ı paralel çek
      const [upperRes, lowerRes] = await Promise.all([
        fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&${fredParams}`),
        fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARL&${fredParams}`)
      ])
      
      if (upperRes.ok && lowerRes.ok) {
        const upperJson = await upperRes.json()
        const lowerJson = await lowerRes.json()
        
        const upperObs = Array.isArray(upperJson?.observations) ? upperJson.observations : []
        const lowerObs = Array.isArray(lowerJson?.observations) ? lowerJson.observations : []
        
        // Parse fonksiyonu
        const parseValue = (v) => {
          if (v == null || v === '.' || v === '') return null
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        
        if (upperObs.length > 0 && lowerObs.length > 0) {
          // Mevcut değerler (en güncel) - ilk gözlem
          announcedUpper = parseValue(upperObs[0]?.value)
          announcedLower = parseValue(lowerObs[0]?.value)
          
          // Mevcut değerin tarihi (ilk gözlemin tarihi)
          const currentDate = upperObs[0]?.date ? new Date(upperObs[0].date) : null
          
          // Upper için: Mevcut tarihten önceki en son değeri bul
          for (let i = 1; i < upperObs.length; i++) {
            const obsDate = upperObs[i]?.date ? new Date(upperObs[i].date) : null
            const val = parseValue(upperObs[i]?.value)
            
            // Tarih kontrolü: Mevcut tarihten önceki ilk geçerli değeri bul
            if (val !== null && obsDate && currentDate && obsDate < currentDate) {
              previousUpper = val
              break
            }
          }
          
          // Lower için: Mevcut tarihten önceki en son değeri bul
          const currentDateLower = lowerObs[0]?.date ? new Date(lowerObs[0].date) : null
          
          for (let i = 1; i < lowerObs.length; i++) {
            const obsDate = lowerObs[i]?.date ? new Date(lowerObs[i].date) : null
            const val = parseValue(lowerObs[i]?.value)
            
            // Tarih kontrolü: Mevcut tarihten önceki ilk geçerli değeri bul
            if (val !== null && obsDate && currentDateLower && obsDate < currentDateLower) {
              previousLower = val
              break
            }
          }
          
          // Eğer tarih bazlı bulunamadıysa (tarih bilgisi yok veya tüm değerler aynı tarihte), ikinci gözlemi al
          if (previousUpper === null && upperObs.length > 1) {
            const secondVal = parseValue(upperObs[1]?.value)
            if (secondVal !== null) {
              previousUpper = secondVal
              console.log(`⚠️ FRED API Upper: Tarih bazlı bulunamadı, ikinci gözlem alındı: ${secondVal} (mevcut: ${announcedUpper})`)
            }
          }
          
          if (previousLower === null && lowerObs.length > 1) {
            const secondVal = parseValue(lowerObs[1]?.value)
            if (secondVal !== null) {
              previousLower = secondVal
              console.log(`⚠️ FRED API Lower: Tarih bazlı bulunamadı, ikinci gözlem alındı: ${secondVal} (mevcut: ${announcedLower})`)
            }
          }
        }
      } else {
        console.warn('⚠️ FRED API isteği başarısız:', {
          upper: upperRes.status,
          lower: lowerRes.status
        })
      }
    } catch (fredError) {
      console.warn('⚠️ FRED API hatası:', fredError.message)
    }
  } else {
    console.warn('⚠️ FRED_API_KEY bulunamadı, sadece RSS ve Calendar verileri kullanılacak')
  }
  
  // 2. RSS feed'den son açıklama tarihini çek (proxy kullan)
  try {
    console.log('📰 RSS feed\'den veri çekiliyor...')
    const rssUrl = 'https://www.federalreserve.gov/feeds/press_monetary.xml'
    
    // Daha fazla proxy URL'leri dene (daha güvenilir servisler)
    const proxyUrls = [
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`,
      `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(rssUrl)}`,
      rssUrl // Direkt dene (son çare)
    ]
    
    let rssText = null
    let rssResponse = null
    
    for (const proxyUrl of proxyUrls) {
      try {
        // Timeout'u artır ve daha fazla retry yap
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 saniye timeout
        
        try {
          rssResponse = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/xml, application/rss+xml, text/xml, */*',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
          
          if (rssResponse.ok) {
            if (proxyUrl.includes('rss2json.com')) {
              // JSON format
              const json = await rssResponse.json()
              if (json.items && json.items.length > 0) {
                const impl = json.items.find(item => 
                  (item.title || '').toLowerCase().includes('implementation note')
                ) || json.items[0]
                
                if (impl.pubDate) {
                  const date = new Date(impl.pubDate)
                  if (!isNaN(date.getTime())) {
                    lastAnnounceDate = date.toISOString()
                    console.log(`✅ RSS feed başarıyla çekildi (${proxyUrl.includes('rss2json') ? 'rss2json' : 'proxy'})`)
                    break
                  }
                }
              }
            } else {
              // XML format
              rssText = await rssResponse.text()
              if (rssText && rssText.length > 0) {
                console.log(`✅ RSS feed başarıyla çekildi (${proxyUrl === rssUrl ? 'direkt' : 'proxy'})`)
                break
              }
            }
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          throw fetchError
        }
      } catch (proxyError) {
        // Sessizce devam et, bir sonraki proxy'yi dene
        if (proxyUrl === rssUrl) {
          // Son proxy (direkt) başarısız olduysa uyar
          console.warn(`⚠️ RSS feed hatası (${proxyUrl}):`, proxyError.message)
        }
        continue
      }
    }
    
    // XML parse et
    if (rssText) {
      const itemRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi
      let match
      let latestDate = null
      
      while ((match = itemRegex.exec(rssText))) {
        const title = (match[1] || '').trim().replace(/<[^>]*>/g, '')
        const pubDate = match[2] || ''
        
        if (title.toLowerCase().includes('implementation note')) {
          const date = new Date(pubDate)
          if (!isNaN(date.getTime()) && (!latestDate || date > latestDate)) {
            latestDate = date
          }
        }
      }
      
      if (latestDate) {
        lastAnnounceDate = latestDate.toISOString()
        console.log(`✅ RSS feed'den Implementation Note tarihi bulundu: ${latestDate.toISOString()}`)
      } else {
        // Implementation Note bulunamadıysa, en son haberin tarihini al
        const allItemsRegex = /<item>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>[\s\S]*?<\/item>/gi
        let allMatches = []
        let allMatch
        while ((allMatch = allItemsRegex.exec(rssText))) {
          const pubDate = allMatch[1] || ''
          const date = new Date(pubDate)
          if (!isNaN(date.getTime())) {
            allMatches.push(date)
          }
        }
        if (allMatches.length > 0) {
          allMatches.sort((a, b) => b - a) // En yeni önce
          lastAnnounceDate = allMatches[0].toISOString()
          console.log(`✅ RSS feed'den en son haber tarihi alındı: ${allMatches[0].toISOString()}`)
        } else {
          console.warn('⚠️ RSS (XML): Hiçbir tarih bulunamadı')
        }
      }
    } else {
      // RSS text yoksa, sadece uyar (FRED API'den gelen veriler yeterli olabilir)
      console.warn('⚠️ RSS: Hiçbir proxy çalışmadı, RSS verisi alınamadı (FRED API verileri kullanılacak)')
    }
  } catch (rssError) {
    console.warn('⚠️ RSS feed hatası:', rssError.message)
    console.warn('⚠️ RSS error stack:', rssError.stack)
  }
  
  // 3. FOMC Calendar'dan sonraki karar tarihini çek (proxy kullan)
  try {
    console.log('📅 FOMC Calendar\'dan veri çekiliyor...')
    const calendarUrl = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
    
    // Proxy URL'leri dene
    const proxyUrls = [
      `https://api.allorigins.win/raw?url=${encodeURIComponent(calendarUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(calendarUrl)}`,
      calendarUrl // Direkt dene
    ]
    
    let html = null
    
    for (const proxyUrl of proxyUrls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 saniye timeout
        
        try {
          const calendarResponse = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)
        
          if (calendarResponse.ok) {
            html = await calendarResponse.text()
            break
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          throw fetchError
        }
      } catch (proxyError) {
        // Sessizce devam et, bir sonraki proxy'yi dene
        if (proxyUrl === calendarUrl) {
          // Son proxy (direkt) başarısız olduysa uyar
          console.warn(`⚠️ FOMC Calendar hatası (${proxyUrl}):`, proxyError.message)
        }
        continue
      }
    }
    
    if (html) {
      const now = new Date()
      const currentYear = now.getFullYear()
      const nextYear = currentYear + 1
      const validYears = [currentYear, nextYear]
      
      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }
      
      // HTML yapısı: <div class="fomc-meeting__month"><strong>December</strong></div>
      //              <div class="fomc-meeting__date">9-10*</div>
      // Yıl bilgisi: <h4><a id="...">2025 FOMC Meetings</a></h4>
      
      // Önce yıl panellerini bul
      const yearPanelRegex = /<h4><a[^>]*>(\d{4})\s+FOMC\s+Meetings<\/a><\/h4>/gi
      const yearPanels = []
      let yearMatch
      while ((yearMatch = yearPanelRegex.exec(html))) {
        const year = Number(yearMatch[1])
        if (validYears.includes(year)) {
          yearPanels.push({
            year,
            startIndex: yearMatch.index,
            endIndex: yearMatch.index + yearMatch[0].length
          })
        }
      }
      
      // Her yıl paneli için toplantı tarihlerini bul
      let nextDate = null
      
      for (const panel of yearPanels) {
        // Panel içindeki HTML'i al
        const panelEndIndex = panel.endIndex
        const nextPanelIndex = yearPanels.find(p => p.startIndex > panel.startIndex)?.startIndex || html.length
        const panelHtml = html.substring(panelEndIndex, nextPanelIndex)
        
        // Ay ve gün bilgilerini bul
        // Format: <strong>December</strong> ... <div class="fomc-meeting__date">9-10*</div>
        const meetingRegex = /<strong>(January|February|March|April|May|June|July|August|September|October|November|December)<\/strong>[\s\S]*?<div[^>]*class="[^"]*fomc-meeting__date[^"]*"[^>]*>(\d{1,2})(?:\s*(?:–|-|\u2013|\u2014|to)\s*(\d{1,2}))?/gi
        
        let meetingMatch
        while ((meetingMatch = meetingRegex.exec(panelHtml))) {
          const monthName = meetingMatch[1].toLowerCase()
          const day1 = Number(meetingMatch[2])
          const day2 = meetingMatch[3] ? Number(meetingMatch[3]) : day1
          const mIdx = months[monthName]
          
          if (mIdx != null) {
            const decisionDate = new Date(Date.UTC(panel.year, mIdx, day2, 19, 0, 0))
            if (decisionDate > now && (!nextDate || decisionDate < nextDate)) {
              nextDate = decisionDate
            }
          }
        }
      }
      
      if (nextDate) {
        const horizonMs = 180 * 24 * 60 * 60 * 1000 // 6 ay
        const timeDiff = nextDate.getTime() - now.getTime()
        if (timeDiff > 0 && timeDiff <= horizonMs) {
          nextDecisionDate = nextDate.toISOString()
        } else {
          console.warn('⚠️ FOMC Calendar: Bulunan tarih çok uzak, atlanıyor')
        }
      } else {
        console.warn('⚠️ FOMC Calendar: Geçerli yıllar içinde tarih bulunamadı')
      }
    } else {
      console.warn('⚠️ FOMC Calendar: HTML çekilemedi')
    }
  } catch (calendarError) {
    console.warn('⚠️ FOMC Calendar hatası:', calendarError.message)
  }
  
  return {
    announcedUpper,
    announcedLower,
    previousUpper,
    previousLower,
    lastAnnounceDate,
    nextDecisionDate,
  }
}
