/**
 * News API Handler
 * RSS feed'lerden haberleri çeker ve MongoDB'ye kaydeder
 * 3 kaynak: Kriptofoni, Cointelegraph TR, Bitcoinsistemi
 */

let db = null

export function setDb(database) {
  db = database
}

/**
 * RSS feed'i parse et
 */
function parseRSSFeed(xml, source) {
  const newsItems = []
  
  try {
    // Basit XML parsing (RSS format)
    const itemMatches = xml.match(/<item[^>]*>([\s\S]*?)<\/item>/gi)
    
    if (!itemMatches) return newsItems
    
    const now = new Date()
    const cutoff = new Date(now.getTime() - (48 * 60 * 60 * 1000)) // Son 48 saat
    
    for (const itemXml of itemMatches) {
      try {
        const titleMatch = itemXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const linkMatch = itemXml.match(/<link[^>]*>([\s\S]*?)<\/link>/i)
        const pubDateMatch = itemXml.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)
        const descriptionMatch = itemXml.match(/<description[^>]*>([\s\S]*?)<\/description>/i)
        const contentEncodedMatch = itemXml.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i)
        
        if (!titleMatch || !linkMatch) continue
        
        const title = (titleMatch[1] || '').trim().replace(/<[^>]*>/g, '')
        const url = (linkMatch[1] || '').trim()
        const pubDateStr = pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString()
        const rawDescription = descriptionMatch ? (descriptionMatch[1] || '').trim() : ''
        const description = rawDescription.replace(/<[^>]*>/g, '')
        const contentEncoded = contentEncodedMatch ? (contentEncodedMatch[1] || '').trim() : ''

        // Resim URL'i çıkar (client-side extractImageFromItem mantığına göre)
        let imageUrl = null
        
        // 1. Enclosure tag (genellikle en güvenilir)
        const enclosureMatch = itemXml.match(/<enclosure[^>]+(?:url|link)=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?/i)
        if (enclosureMatch) {
          const enclosureUrl = enclosureMatch[1]
          const enclosureType = (enclosureMatch[2] || '').toLowerCase()
          if (enclosureType.includes('image') || /\.(png|jpe?g|webp|gif|svg)$/i.test(enclosureUrl)) {
            imageUrl = enclosureUrl
          }
        }
        
        // 2. Media namespace tags (media:content, media:thumbnail)
        if (!imageUrl) {
          const mediaContentMatch = itemXml.match(/<media:content[^>]+(?:url|href)=["']([^"']+)["'][^>]*>/i)
          if (mediaContentMatch && mediaContentMatch[1]) {
            imageUrl = mediaContentMatch[1]
          }
        }
        
        if (!imageUrl) {
          const mediaThumbnailMatch = itemXml.match(/<media:thumbnail[^>]+(?:url|href)=["']([^"']+)["'][^>]*>/i)
          if (mediaThumbnailMatch && mediaThumbnailMatch[1]) {
            imageUrl = mediaThumbnailMatch[1]
          }
        }
        
        // 3. Image tag (direct)
        if (!imageUrl) {
          const imageTagMatch = itemXml.match(/<image[^>]*>(?:.*?<(?:url|href)>([^<]+)<\/\1>|.*?)/i) || 
                                 itemXml.match(/<image[^>]+(?:url|href)=["']([^"']+)["'][^>]*>/i)
          if (imageTagMatch && imageTagMatch[1]) {
            imageUrl = imageTagMatch[1].trim()
          }
        }
        
        // 4. WordPress featured image (wp:attachment_url, wp:featured_image)
        if (!imageUrl) {
          const wpAttachmentMatch = itemXml.match(/<(?:wp:attachment_url|featured_image)[^>]*>([^<]+)<\/(?:wp:attachment_url|featured_image)>/i)
          if (wpAttachmentMatch && wpAttachmentMatch[1]) {
            imageUrl = wpAttachmentMatch[1].trim()
          }
        }
        
        // 5. content:encoded veya description içindeki HTML img tags (en detaylı)
        if (!imageUrl) {
          const html = contentEncoded || rawDescription
          if (html) {
            // CDATA içeriğini temizle
            let decodedHtml = html.replace(/<!\[CDATA\[(.*?)\]\]>/gis, '$1')
            // HTML entity decode
            decodedHtml = decodedHtml
              .replace(/&#x27;/g, "'")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
            
            // Tüm img tag'lerini bul
            const allImgTags = decodedHtml.match(/<img[^>]*>/gi) || []
            
            for (const imgTag of allImgTags) {
              // data-lazy-src, data-src (lazyload) - en yüksek öncelik
              const lazySrcMatch = imgTag.match(/data-(?:lazy-)?src=["']([^"'>]+)["']/i) || 
                                   imgTag.match(/data-(?:lazy-)?src=([^\s>]+)/i)
              if (lazySrcMatch) {
                imageUrl = lazySrcMatch[1].replace(/["']/g, '').trim()
                break
              }
              
              // src attribute
              const srcMatch = imgTag.match(/src=["']([^"'>]+)["']/i) || 
                              imgTag.match(/src=([^\s>]+)/i)
              if (srcMatch) {
                imageUrl = srcMatch[1].replace(/["']/g, '').trim()
                break
              }
            }
          }
        }
        
        // URL normalize (kriptofoni.com için özel)
        if (imageUrl) {
          imageUrl = imageUrl.trim()
          // protocol-relative
          if (imageUrl.startsWith('//')) {
            imageUrl = 'https:' + imageUrl
          }
          // ensure absolute URL for kriptofoni
          if (imageUrl.startsWith('/') && !imageUrl.startsWith('//')) {
            if (source === 'kriptofoni') {
              imageUrl = 'https://www.kriptofoni.com' + imageUrl
            } else if (source === 'bitcoinsistemi') {
              imageUrl = 'https://bitcoinsistemi.com' + imageUrl
            }
          }
          // remove fragments
          imageUrl = imageUrl.replace(/#.*$/, '')
          // kriptofoni.com domain kontrolü - gereksiz query params temizle
          if (imageUrl.includes('kriptofoni.com')) {
            imageUrl = imageUrl.replace(/\?(?:utm_[^&]*&?|w=\d+&?|h=\d+&?|resize=[^&]*&?|quality=[^&]*&?|ssl=1&?|strip=all&?)+$/, '')
            imageUrl = imageUrl.replace(/&$/, '')
          }
          // bitcoinsistemi.com domain kontrolü - gereksiz query params temizle
          if (imageUrl.includes('bitcoinsistemi.com')) {
            imageUrl = imageUrl.replace(/\?(?:utm_[^&]*&?|w=\d+&?|h=\d+&?|resize=[^&]*&?|quality=[^&]*&?|ssl=1&?|strip=all&?)+$/, '')
            imageUrl = imageUrl.replace(/&$/, '')
          }
        }
        
        // PubDate'i parse et
        let publishedAt = new Date(pubDateStr)
        if (isNaN(publishedAt.getTime())) {
          publishedAt = new Date()
        }
        
        // CoinTelegraph için +3 saat ekle (UTC+3 Türkiye saati)
        if (source === 'cointelegraph') {
          publishedAt = new Date(publishedAt.getTime() + (3 * 60 * 60 * 1000))
        }
        
        // Son 48 saat içindeki haberleri filtrele
        if (publishedAt < cutoff) continue
        
        // URL'yi unique ID olarak kullan
        newsItems.push({
          id: url,
          url: url,
          title: title,
          description: description.substring(0, 500), // Max 500 karakter
          publishedAt: publishedAt,
          source: source,
          category: 'crypto',
          image: imageUrl || '/kriptotek.jpg' // Resim yoksa varsayılan resim
        })
      } catch (itemError) {
        // Tek bir haber parse edilemezse devam et
        continue
      }
    }
    
    // Tarihe göre sırala (en yeni önce)
    newsItems.sort((a, b) => b.publishedAt - a.publishedAt)
  } catch (error) {
    console.error('❌ RSS parse hatası:', error.message)
  }
  
  return newsItems
}

/**
 * Haberleri güncelle (3 kaynaktan paralel çek)
 */
export async function updateNews() {
  if (!db) {
    throw new Error('MongoDB bağlantısı yok')
  }

  try {
    console.log('📊 News güncelleniyor...')
    
    // RSS feed'lerden haberleri çek (PARALEL - 3 kaynak aynı anda)
    const RSS_FEEDS = {
      kriptofoni: 'https://kriptofoni.com/feed/',
      cointelegraph: 'https://cointelegraph.com.tr/rss',
      bitcoinsistemi: 'https://www.bitcoinsistemi.com/feed/'
    }
    
    const allNews = []
    
    // 3 kaynaktan PARALEL çek
    const [kriptofoniResult, cointelegraphResult, bitcoinsistemiResult] = await Promise.allSettled([
      // Kriptofoni RSS feed'ini çek
      (async () => {
        try {
          const response = await fetch(RSS_FEEDS.kriptofoni, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          if (response.ok) {
            const xml = await response.text()
            const news = parseRSSFeed(xml, 'kriptofoni')
            console.log(`✅ ${news.length} Kriptofoni haberi çekildi`)
            return news
          }
          return []
        } catch (err) {
          console.error('❌ Kriptofoni RSS hatası:', err.message)
          return []
        }
      })(),
      
      // Cointelegraph RSS feed'ini çek (direkt RSS parse)
      (async () => {
        try {
          // Önce rss2json API'yi dene
          const rss2jsonUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://tr.cointelegraph.com/rss')}`
          let response = await fetch(rss2jsonUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          
          let news = []
          
          if (response.ok) {
            try {
              const data = await response.json()
              const items = Array.isArray(data.items) ? data.items : []
              
              const now = new Date()
              const cutoff = new Date(now.getTime() - (48 * 60 * 60 * 1000)) // Son 48 saat
              
              news = items
                .map(item => {
                  const title = item.title || ''
                  const url = item.link || item.url || ''
                  const descriptionRaw = item.description || ''
                  const description = descriptionRaw.replace(/<[^>]*>/g, '').substring(0, 500)
                  const pubDateRaw = item.pubDate || item.pubdate || ''
                  let pubDate = pubDateRaw ? new Date(pubDateRaw) : new Date()
                  
                  // CoinTelegraph için +3 saat ekle (UTC+3 Türkiye saati)
                  pubDate = new Date(pubDate.getTime() + (3 * 60 * 60 * 1000))
                  
                  // Resim URL'i çıkar
                  let imageUrl = item.enclosure?.link || item.thumbnail || ''
                  if (!imageUrl && descriptionRaw) {
                    const imgMatch = descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i)
                    if (imgMatch) imageUrl = imgMatch[1]
                  }
                  if (imageUrl && imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl
                  }
                  
                  return {
                    id: url,
                    url: url,
                    title: title,
                    description: description,
                    publishedAt: pubDate,
                    source: 'cointelegraph',
                    category: 'crypto',
                    image: imageUrl || '/kriptotek.jpg'
                  }
                })
                .filter(item => item.publishedAt >= cutoff)
                .sort((a, b) => b.publishedAt - a.publishedAt)
              
              if (news.length > 0) {
                console.log(`✅ ${news.length} Cointelegraph haberi çekildi (rss2json)`)
                return news
              }
            } catch (jsonError) {
              console.warn('⚠️ rss2json parse hatası, direkt RSS deneniyor:', jsonError.message)
            }
          }
          
          // rss2json başarısız olursa direkt RSS feed'i parse et
          response = await fetch('https://tr.cointelegraph.com/rss', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          
          if (response.ok) {
            const xml = await response.text()
            news = parseRSSFeed(xml, 'cointelegraph')
            console.log(`✅ ${news.length} Cointelegraph haberi çekildi (direkt RSS)`)
            return news
          } else {
            console.error(`❌ Cointelegraph RSS hatası: HTTP ${response.status}`)
          }
          
          return []
        } catch (err) {
          console.error('❌ Cointelegraph RSS hatası:', err.message)
          return []
        }
      })(),
      
      // Bitcoinsistemi RSS feed'ini çek
      (async () => {
        try {
          const response = await fetch(RSS_FEEDS.bitcoinsistemi, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          if (response.ok) {
            const xml = await response.text()
            const news = parseRSSFeed(xml, 'bitcoinsistemi')
            console.log(`✅ ${news.length} Bitcoinsistemi haberi çekildi`)
            return news
          }
          return []
        } catch (err) {
          console.error('❌ Bitcoinsistemi RSS hatası:', err.message)
          return []
        }
      })()
    ])
    
    // Sonuçları topla
    if (kriptofoniResult.status === 'fulfilled') {
      allNews.push(...kriptofoniResult.value)
    }
    if (cointelegraphResult.status === 'fulfilled') {
      allNews.push(...cointelegraphResult.value)
    }
    if (bitcoinsistemiResult.status === 'fulfilled') {
      allNews.push(...bitcoinsistemiResult.value)
    }
    
    // Tüm haberleri publishedAt'a göre sırala (en yeni önce)
    allNews.sort((a, b) => {
      const dateA = new Date(a.publishedAt).getTime()
      const dateB = new Date(b.publishedAt).getTime()
      return dateB - dateA // Azalan sıra (en yeni önce)
    })
    
    // MongoDB'ye kaydet (URL'yi unique ID olarak kullan)
    if (allNews.length > 0) {
      let savedCount = 0
      let skippedCount = 0
      
      for (const newsItem of allNews) {
        try {
          await db.collection('crypto_news').replaceOne(
            { _id: newsItem.url },
            {
              _id: newsItem.url,
              ...newsItem,
              createdAt: new Date(),
              updatedAt: new Date()
            },
            { upsert: true }
          )
          savedCount++
        } catch (err) {
          skippedCount++
        }
      }
      
      console.log(`✅ ${savedCount} haber kaydedildi (en yeni önce sıralandı), ${skippedCount} haber atlandı`)
    } else {
      console.log('⚠️ Hiç haber çekilemedi')
    }

    // 24 saatten eski haberleri veritabanından sil
    try {
      const now = new Date()
      const cutoff24Hours = new Date(now.getTime() - (24 * 60 * 60 * 1000))
      const deleteResult = await db.collection('crypto_news').deleteMany({
        publishedAt: { $lt: cutoff24Hours }
      })
      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️ ${deleteResult.deletedCount} eski haber veritabanından silindi (24 saatten eski)`)
      }
    } catch (err) {
      console.error('❌ Eski haberleri silme hatası:', err.message)
    }

    return allNews
  } catch (error) {
    console.error('❌ News API error:', error)
    throw error
  }
}

