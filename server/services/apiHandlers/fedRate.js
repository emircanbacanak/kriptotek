export async function fetchFedRateData(dbInstance = null) {
  const FRED_API_KEY = process.env.FRED_API_KEY

  let announcedUpper = null
  let announcedLower = null
  let previousUpper = null
  let previousLower = null
  let lastAnnounceDate = null
  let nextDecisionDate = null

  // MongoDB'den önceki kaydı al (fallback için)
  let previousRecord = null
  if (dbInstance) {
    try {
      const collection = dbInstance.collection('api_cache')
      const cached = await collection.findOne({ _id: 'fed_rate' })
      if (cached && cached.data) {
        previousRecord = cached.data
        console.log('📦 MongoDB\'den önceki Fed Rate kaydı bulundu (fallback için)')
      }
    } catch (mongoError) {
      console.warn('⚠️ MongoDB\'den önceki kayıt alınamadı:', mongoError.message)
    }
  }

  // 1. ÖNCE RSS FEED'DEN SON AÇIKLANMA TARİHİNİ AL (önceki değer için gerekli)
  // Bu tarihten önceki değerleri çekeceğiz
  try {
    console.log('📰 RSS feed\'den son açıklanma tarihi çekiliyor...')
    const rssUrl = 'https://www.federalreserve.gov/feeds/press_monetary.xml'

    const proxyUrls = [
      `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
      `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`,
      `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(rssUrl)}`,
      rssUrl
    ]

    let rssText = null

    for (const proxyUrl of proxyUrls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        try {
          const rssResponse = await fetch(proxyUrl, {
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
              const json = await rssResponse.json()
              if (json.items && json.items.length > 0) {
                const impl = json.items.find(item =>
                  (item.title || '').toLowerCase().includes('implementation note')
                ) || json.items[0]

                if (impl.pubDate) {
                  const date = new Date(impl.pubDate)
                  if (!isNaN(date.getTime())) {
                    lastAnnounceDate = date.toISOString()
                    console.log(`✅ RSS feed'den son açıklanma tarihi alındı: ${lastAnnounceDate}`)
                    break
                  }
                }
              }
            } else {
              rssText = await rssResponse.text()
              if (rssText && rssText.length > 0) {
                break
              }
            }
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          throw fetchError
        }
      } catch (proxyError) {
        if (proxyUrl === rssUrl) {
          console.warn(`⚠️ RSS feed hatası (${proxyUrl}):`, proxyError.message)
        }
        continue
      }
    }

    // XML parse et
    if (rssText && !lastAnnounceDate) {
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
        console.log(`✅ RSS feed'den Implementation Note tarihi bulundu: ${lastAnnounceDate}`)
      } else {
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
          allMatches.sort((a, b) => b - a)
          lastAnnounceDate = allMatches[0].toISOString()
          console.log(`✅ RSS feed'den en son haber tarihi alındı: ${lastAnnounceDate}`)
        }
      }
    }
  } catch (rssError) {
    console.warn('⚠️ RSS feed hatası (önceki değer için tarih alınamadı):', rssError.message)
  }

  // 2. FRED API'den mevcut ve önceki oranları çek (tarih bazlı)
  if (FRED_API_KEY) {
    try {
      console.log('📊 FRED API\'den veri çekiliyor...')

      // Mevcut değerler için (en güncel)
      const fredParams = `api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`

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

          console.log(`✅ FRED API'den mevcut değerler alındı: Upper=${announcedUpper}, Lower=${announcedLower}`)

          // ÖNCEKİ DEĞERLER: Son açıklanma tarihinden önceki en son gerçek açıklanma tarihindeki değerleri çek
          if (lastAnnounceDate) {
            const announceDate = new Date(lastAnnounceDate)
            const announceDateStr = announceDate.toISOString().split('T')[0] // YYYY-MM-DD formatı

            // FRED API'den son açıklanma tarihinden önceki tüm gözlemleri çek (limit=50 yeterli olmalı)
            const previousParams = `api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=50&observation_end=${announceDateStr}`

            const [previousUpperRes, previousLowerRes] = await Promise.all([
              fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&${previousParams}`),
              fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARL&${previousParams}`)
            ])

            if (previousUpperRes.ok && previousLowerRes.ok) {
              const previousUpperJson = await previousUpperRes.json()
              const previousLowerJson = await previousLowerRes.json()

              const previousUpperObs = Array.isArray(previousUpperJson?.observations) ? previousUpperJson.observations : []
              const previousLowerObs = Array.isArray(previousLowerJson?.observations) ? previousLowerJson.observations : []

              // Son açıklanma tarihinden önceki en son gözlemi bul
              // (Aynı tarihli gözlemler olabilir, o yüzden farklı bir tarih bulmalıyız)
              let foundPrevious = false

              for (let i = 0; i < previousUpperObs.length && i < previousLowerObs.length; i++) {
                const obsDate = previousUpperObs[i]?.date
                const obsUpper = parseValue(previousUpperObs[i]?.value)
                const obsLower = parseValue(previousLowerObs[i]?.value)

                // Geçerli bir değer ve farklı bir tarih bul
                if (obsUpper !== null && obsLower !== null && obsDate) {
                  const obsDateObj = new Date(obsDate)
                  // Son açıklanma tarihinden önceki bir tarih olmalı (en az 25 gün fark - Fed kararları genellikle 6-8 hafta arayla açıklanır)
                  const daysDiff = (announceDate.getTime() - obsDateObj.getTime()) / (1000 * 60 * 60 * 24)

                  if (daysDiff >= 30) {
                    previousUpper = obsUpper
                    previousLower = obsLower
                    foundPrevious = true
                    console.log(`✅ FRED API'den önceki değerler alındı (tarih bazlı): Upper=${previousUpper}, Lower=${previousLower}, Tarih: ${obsDate} (${Math.round(daysDiff)} gün önce)`)
                    break
                  }
                }
              }

              if (!foundPrevious) {
                console.warn(`⚠️ Son açıklanma tarihinden (${announceDateStr}) önceki farklı bir tarih bulunamadı`)
              }
            } else {
              console.warn('⚠️ FRED API önceki değer isteği başarısız:', {
                upper: previousUpperRes.status,
                lower: previousLowerRes.status
              })
            }
          } else {
            console.log('ℹ️ Son açıklanma tarihi bulunamadı, önceki değerler için ikinci gözlem kullanılacak')
            // Fallback: Daha fazla gözlem çek ve ikinci farklı tarihi bul
            const allParams = `api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=50`
            const [allUpperRes, allLowerRes] = await Promise.all([
              fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARU&${allParams}`),
              fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARL&${allParams}`)
            ])

            if (allUpperRes.ok && allLowerRes.ok) {
              const allUpperJson = await allUpperRes.json()
              const allLowerJson = await allLowerRes.json()

              const allUpperObs = Array.isArray(allUpperJson?.observations) ? allUpperJson.observations : []
              const allLowerObs = Array.isArray(allLowerJson?.observations) ? allLowerJson.observations : []

              // İlk gözlemin tarihini al
              const currentDate = allUpperObs[0]?.date

              // Farklı bir tarihli gözlem bul
              for (let i = 1; i < allUpperObs.length && i < allLowerObs.length; i++) {
                const obsDate = allUpperObs[i]?.date
                const obsUpper = parseValue(allUpperObs[i]?.value)
                const obsLower = parseValue(allLowerObs[i]?.value)

                if (obsUpper !== null && obsLower !== null && obsDate && obsDate !== currentDate) {
                  previousUpper = obsUpper
                  previousLower = obsLower
                  console.log(`✅ FRED API'den önceki değerler alındı (farklı tarih): Upper=${previousUpper}, Lower=${previousLower}, Tarih: ${obsDate}`)
                  break
                }
              }
            }
          }
        } else {
          console.warn('⚠️ FRED API: Gözlem verisi boş')
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
    console.warn('⚠️ FRED_API_KEY bulunamadı, alternatif kaynaklar kullanılacak')
  }

  // 3. ÖNCEKİ DEĞERLER İÇİN FALLBACK (FRED API'den tarih bazlı çekilemediyse)
  if (announcedUpper !== null || announcedLower !== null) {
    // Fallback 1: MongoDB'deki önceki kayıt
    if ((previousUpper === null || previousLower === null) && previousRecord) {
      console.log('🔄 Önceki değerler hala bulunamadı, MongoDB\'deki önceki kayıttan alınıyor...')
      if (previousUpper === null && previousRecord.previousUpper !== null && previousRecord.previousUpper !== undefined) {
        previousUpper = previousRecord.previousUpper
        console.log(`✅ MongoDB\'den önceki Upper değer alındı: ${previousUpper}`)
      }
      if (previousLower === null && previousRecord.previousLower !== null && previousRecord.previousLower !== undefined) {
        previousLower = previousRecord.previousLower
        console.log(`✅ MongoDB\'den önceki Lower değer alındı: ${previousLower}`)
      }
    }

    // Fallback 2: Mevcut değerleri önceki olarak kullan (Fed faiz sabit tutulmuş olabilir)
    if ((previousUpper === null || previousLower === null) && announcedUpper !== null && announcedLower !== null) {
      console.log('🔄 Önceki değerler bulunamadı, mevcut değerler önceki olarak kullanılıyor (Fed faiz sabit tutulmuş olabilir)...')
      if (previousUpper === null) {
        previousUpper = announcedUpper
        console.log(`✅ Mevcut Upper değer önceki olarak kullanıldı: ${previousUpper}`)
      }
      if (previousLower === null) {
        previousLower = announcedLower
        console.log(`✅ Mevcut Lower değer önceki olarak kullanıldı: ${previousLower}`)
      }
    }
  }

  // 3. Sonraki karar tarihini hesapla
  // MongoDB'deki önceki kayıttan sonraki toplantı tarihini al (fallback)
  let nextDecisionFromCache = null
  if (previousRecord?.nextDecisionDate) {
    const cachedDate = new Date(previousRecord.nextDecisionDate)
    const now = new Date()
    const daysDiff = (cachedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    // Cache'deki tarih gelecekte VE 7-120 gün içinde olmalı (geçerli FOMC aralığı)
    if (daysDiff >= 7 && daysDiff <= 120) {
      nextDecisionFromCache = cachedDate
      console.log('📦 MongoDB\'den sonraki karar tarihi bulundu:', previousRecord.nextDecisionDate)
    } else if (daysDiff > 0) {
      console.log('⚠️ MongoDB cache\'deki tarih geçersiz aralıkta:', previousRecord.nextDecisionDate, `(${Math.round(daysDiff)} gün)`)
    }
  }

  try {
    const calendarUrl = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'

    // Proxy URL'leri dene
    const proxyUrls = [
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(calendarUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(calendarUrl)}`,
      calendarUrl // Direkt dene
    ]

    let html = null

    for (const proxyUrl of proxyUrls) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        try {
          const calendarResponse = await fetch(proxyUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal
          })

          clearTimeout(timeoutId)

          if (calendarResponse.ok) {
            const text = await calendarResponse.text()
            // HTML'in geçerli olup olmadığını kontrol et
            if (text.length > 50000 && text.includes('fomc-meeting__date')) {
              html = text
              break
            }
          }
        } catch (fetchError) {
          clearTimeout(timeoutId)
          throw fetchError
        }
      } catch (proxyError) {
        continue
      }
    }

    if (html) {
      const now = new Date()
      const currentYear = now.getFullYear()

      // Tüm toplantı tarihlerini çıkar
      // Format: class="fomc-meeting__date...">28-29* veya >27-28
      // Ve öncesinde ay bilgisi: <strong>January</strong>
      const allDates = []

      const months = {
        january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
        july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
      }

      // Yıl bölümlerini bul
      for (let year = currentYear; year <= currentYear + 2; year++) {
        const yearPattern = new RegExp(`${year}\\s+FOMC\\s+Meetings`, 'i')
        const yearIdx = html.search(yearPattern)

        if (yearIdx === -1) continue

        // Bu yılın bölümündeki toplantıları bul (sonraki yıla kadar)
        const nextYearPattern = new RegExp(`${year + 1}\\s+FOMC\\s+Meetings`, 'i')
        const nextYearIdx = html.search(nextYearPattern)
        const sectionEnd = nextYearIdx > yearIdx ? nextYearIdx : html.length
        const sectionHtml = html.substring(yearIdx, sectionEnd)

        // Bu bölümdeki ay-gün eşleşmelerini bul
        // <strong>January</strong> ... fomc-meeting__date...">27-28
        const meetingPattern = /<strong>(January|February|March|April|May|June|July|August|September|October|November|December)<\/strong>[\s\S]{0,500}?fomc-meeting__date[^>]*>(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?/gi

        let match
        while ((match = meetingPattern.exec(sectionHtml))) {
          const monthName = match[1].toLowerCase()
          const day1 = parseInt(match[2])
          const day2 = match[3] ? parseInt(match[3]) : day1
          const monthIdx = months[monthName]

          if (monthIdx !== undefined) {
            // Karar günü: toplantının son günü, 19:00 UTC
            const decisionDate = new Date(Date.UTC(year, monthIdx, day2, 19, 0, 0))
            allDates.push(decisionDate)
          }
        }
      }

      // Gelecekteki en yakın tarihi bul
      const now2 = new Date()
      const futureDates = allDates.filter(d => d > now2).sort((a, b) => a - b)

      if (futureDates.length > 0) {
        const candidateDate = futureDates[0]
        const daysDiff = (candidateDate.getTime() - now2.getTime()) / (1000 * 60 * 60 * 24)
        // Geçerli bir sonraki toplantı tarihi 7-120 gün içinde olmalı
        // (6-8 hafta arayla toplantılar yapılıyor)
        if (daysDiff >= 7 && daysDiff <= 120) {
          nextDecisionDate = candidateDate.toISOString()
        } else {
          console.warn(`⚠️ FOMC Calendar: Bulunan tarih makul aralıkta değil (${Math.round(daysDiff)} gün), atlanıyor`)
        }
      } else {
        console.warn('⚠️ FOMC Calendar: Gelecekte tarih bulunamadı')
      }
    } else {
      console.warn('⚠️ FOMC Calendar: Geçerli HTML çekilemedi')
    }
  } catch (calendarError) {
    console.warn('⚠️ FOMC Calendar hatası:', calendarError.message)
  }

  // Fallback 1: MongoDB cache'den al
  if (!nextDecisionDate && nextDecisionFromCache) {
    nextDecisionDate = nextDecisionFromCache.toISOString()
    console.log('✅ MongoDB cache\'den sonraki karar tarihi kullanıldı:', nextDecisionDate)
  }

  // Fallback 2: Son açıklama tarihinden ~45 gün sonrasını tahmin et
  if (!nextDecisionDate && lastAnnounceDate) {
    const lastDate = new Date(lastAnnounceDate)
    // FOMC toplantıları genellikle 6-7 hafta arayla yapılır (ortalama 45 gün)
    const estimatedNext = new Date(lastDate.getTime() + (45 * 24 * 60 * 60 * 1000))
    // Karar günü genellikle Çarşamba'dır, en yakın Çarşamba'yı bul
    const dayOfWeek = estimatedNext.getUTCDay()
    const daysToWednesday = (3 - dayOfWeek + 7) % 7
    estimatedNext.setUTCDate(estimatedNext.getUTCDate() + daysToWednesday)
    estimatedNext.setUTCHours(19, 0, 0, 0)

    nextDecisionDate = estimatedNext.toISOString()
    console.log('✅ Son açıklama tarihinden tahmini sonraki karar tarihi hesaplandı:', nextDecisionDate)
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
