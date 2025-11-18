import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ExternalLink, Clock, Calendar, Search, Newspaper, TrendingUp } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { subscribeToNews } from '../firebase/newsData'
import { useTheme } from '../contexts/ThemeContext'

// CSS Animasyonları için style tag
const styles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .animate-fade-in-up {
    animation: fadeInUp 0.5s ease-out;
  }
  
  @keyframes redPulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7), 0 0 0 0 rgba(239, 68, 68, 0.4);
    }
    50% {
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.7), 0 0 0 4px rgba(239, 68, 68, 0.4);
    }
  }
  
  .important-news-card {
    animation: redPulse 2s ease-in-out infinite;
  }
`

function News() {
  const { t } = useLanguage()
  const { theme } = useTheme()
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredNews, setFilteredNews] = useState([])
  const [error, setError] = useState(null)
  const [newNewsCount, setNewNewsCount] = useState(0)
  const unsubscribeRef = useRef(null)
  const previousNewsIdsRef = useRef(new Set())
  const [nowTick, setNowTick] = useState(Date.now())

  // Header gradients: Light mavi→indigo, Dark sarı→turuncu
  const headerIconGradient = theme === 'dark' ? 'from-yellow-600 to-orange-600' : 'from-blue-500 to-indigo-500'
  const headerTextGradient = theme === 'dark' ? 'from-yellow-400 to-orange-400' : 'from-blue-600 to-indigo-600'

  // Önemli haber kontrolü
  const isImportantNews = useCallback((item) => {
    const title = (item.title || '').toLowerCase()
    const desc = (item.description || '').toLowerCase()
    const text = title + ' ' + desc
    
    // Eğer backend'den importance level geliyorsa onu kullan
    if (item.importance?.level === 'high') {
      return true
    }
    
    // 1. Açık önemli kelimeler (yüksek öncelik)
    const criticalKeywords = [
      'breaking', 'acil', 'kritik', 'dikkat', 'uyarı',
      'rekor', 'tarihi', 'ilk defa', 'tarihinde ilk',
      'önemli duyuru', 'önemli açıklama', 'önemli karar',
      'abd', 'faiz', 'fed', 'federal reserve', 'fomc'
    ]
    if (criticalKeywords.some(keyword => text.includes(keyword))) {
      return true
    }
    
    // 2. Büyük fiyat hareketleri (%10+ değişim)
    const bigPriceMovePatterns = [
      /%(\d{2,})/g,  // %10, %20, %50 gibi
      /(\d{2,})%/g,  // 10%, 20%, 50% gibi
      /yüzde\s*(\d{2,})/g,  // yüzde 10, yüzde 20
      /(\d{2,})\s*artış/g,  // 20 artış
      /(\d{2,})\s*düşüş/g   // 20 düşüş
    ]
    const hasBigPriceMove = bigPriceMovePatterns.some(pattern => {
      const matches = text.match(pattern)
      if (matches) {
        // Sayıları çıkar ve 10'dan büyük mü kontrol et
        const numbers = matches.map(m => parseInt(m.replace(/%|artış|düşüş|yüzde|\s/g, ''))).filter(n => !isNaN(n))
        return numbers.some(n => n >= 10)
      }
      return false
    })
    if (hasBigPriceMove) {
      return true
    }
    
    // 3. Önemli regülasyon/yasal haberler
    const regulationKeywords = [
      'yasak', 'onay', 'regülasyon', 'yasal', 'mahkeme',
      'sec', 'cfdc', 'sec onayı', 'sec reddi',
      'borsa kapatma', 'borsa açılış', 'ipo', 'etf onayı'
    ]
    if (regulationKeywords.some(keyword => text.includes(keyword))) {
      return true
    }
    
    // 4. Büyük borsa/şirket haberleri
    const majorExchangeKeywords = [
      'binance', 'coinbase', 'kraken', 'ftx', 'huobi',
      'tesla', 'microstrategy', 'paypal', 'visa', 'mastercard',
      'blackrock', 'fidelity', 'grayscale'
    ]
    // Sadece önemli eylemler için (ekleme, çıkarma, onay, red gibi)
    const majorExchangeActions = ['eklendi', 'çıkarıldı', 'onay', 'red', 'duyuru', 'açıklama']
    if (majorExchangeKeywords.some(exchange => {
      if (text.includes(exchange)) {
        return majorExchangeActions.some(action => text.includes(action))
      }
      return false
    })) {
      return true
    }
    
    // 5. Bitcoin/Ethereum için önemli gelişmeler
    const majorCoinKeywords = ['bitcoin', 'btc', 'ethereum', 'eth']
    const majorCoinEvents = [
      'halving', 'fork', 'upgrade', 'güncelleme', 'hard fork',
      'soft fork', 'merge', 'staking', '2.0', 'ethereum 2.0'
    ]
    if (majorCoinKeywords.some(coin => {
      if (text.includes(coin)) {
        return majorCoinEvents.some(event => text.includes(event))
      }
      return false
    })) {
      return true
    }
    
    // 6. Hacking/güvenlik olayları
    const securityKeywords = [
      'hack', 'çalındı', 'güvenlik açığı', 'exploit',
      'saldırı', 'fidye', 'ransomware'
    ]
    if (securityKeywords.some(keyword => text.includes(keyword))) {
      return true
    }
    
    // Hiçbir kritik kriter sağlanmıyorsa false döndür
    return false
  }, [])

  // Her dakika yeniden render ederek zaman damgalarını canlı güncelle
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 60 * 1000)
    return () => clearInterval(interval)
  }, [])


  useEffect(() => {
    // 1. İlk yüklemede MongoDB WebSocket realtime dinleme başlat
    console.log('🎧 MongoDB WebSocket realtime dinleme başlatılıyor...')
    unsubscribeRef.current = subscribeToNews((newsData) => {
      // Yeni haber sayısını hesapla
      const currentIds = new Set(newsData.map(n => n.id))
      const newIds = [...currentIds].filter(id => !previousNewsIdsRef.current.has(id))
      
      if (newIds.length > 0 && previousNewsIdsRef.current.size > 0) {
        setNewNewsCount(newIds.length)
        console.log(`✨ ${newIds.length} yeni haber geldi!`)
        
        // 3 saniye sonra badge'i temizle
        setTimeout(() => setNewNewsCount(0), 3000)
      }
      
      // Tekilleştir (id+timestamp)
      const seen = new Set()
      const deduped = []
      for (const item of newsData) {
        const time = new Date(item.publishedAt || item.published_at || item.pubDate || item.date || 0).getTime()
        const key = `${item.id || item.url || item.link || item.title}-${time}`
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(item)
      }

      previousNewsIdsRef.current = new Set(deduped.map(n => n.id))
      
      // Son 24 saat içindeki haberleri filtrele (26 saat tampon uygula - fetchKriptofoniNews ile tutarlı olmak için)
      const now = new Date()
      // fetchKriptofoniNews'te 26 saat tampon var, bu yüzden burada da aynı tamponu kullan
      const effectiveHours = 26 // 24 saat + 2 saat tampon (timezone/farklar için)
      const cutoff = new Date(now.getTime() - (effectiveHours * 60 * 60 * 1000))
      const recentNews = deduped.filter(item => {
        const pubDate = new Date(item.publishedAt || item.published_at || item.pubDate || item.date || 0)
        return pubDate >= cutoff
      })
      
      // Şimdi tekrar 24 saat içine filtrele (gösterim için)
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000))
      const within24Hours = recentNews.filter(item => {
        const pubDate = new Date(item.publishedAt || item.published_at || item.pubDate || item.date || 0)
        return pubDate >= twentyFourHoursAgo
      })
      
      // Eğer 24 saat içinde haber varsa onları göster, yoksa 26 saat içindekileri göster
      const finalNews = within24Hours.length > 0 ? within24Hours : recentNews
      
      // Haberleri en yeni önce sırala (publishedAt'a göre azalan sırada)
      finalNews.sort((a, b) => {
        const dateA = new Date(a.publishedAt || a.published_at || a.pubDate || a.date || 0).getTime()
        const dateB = new Date(b.publishedAt || b.published_at || b.pubDate || b.date || 0).getTime()
        return dateB - dateA // Azalan sıra (en yeni önce)
      })
    
      setNews(finalNews)
      setFilteredNews(finalNews)
      setLoading(false)
      console.log(`📰 ${finalNews.length} haber yüklendi (realtime) [deduped, son 24 saat${within24Hours.length < recentNews.length ? ` (${recentNews.length - within24Hours.length} haber 24-26 saat aralığında)` : ''}]`)
    })

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        console.log('🔇 Firestore listener kapatıldı')
      }
    }
  }, [])

  // Arama filtreleme (zaten 24 saat içindeki haberler)
  useEffect(() => {
    let filtered = news
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = news.filter(item =>
        item.title.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      )
    }
    
    // Arama sonuçlarını da en yeni önce sırala
    filtered.sort((a, b) => {
      const dateA = new Date(a.publishedAt || a.published_at || a.pubDate || a.date || 0).getTime()
      const dateB = new Date(b.publishedAt || b.published_at || b.pubDate || b.date || 0).getTime()
      return dateB - dateA // Azalan sıra (en yeni önce)
    })
    
    setFilteredNews(filtered)
  }, [searchQuery, news])

  // Zaman formatı (Europe/Istanbul)
  function parseIstanbulDate(input) {
    if (!input) return null
    if (input instanceof Date) return input
    if (typeof input === 'number') return new Date(input)
    if (typeof input === 'string') {
      // ISO formatında UTC timezone varsa (Z veya +00:00), UTC olarak parse et
      // Veritabanından gelen tarih neyse o şekilde kullan
      if (input.includes('T') && (input.includes('Z') || input.includes('+00:00') || input.match(/[+-]\d{2}:\d{2}$/))) {
        // UTC olarak parse et (veritabanındaki gibi)
        return new Date(input)
      }
      
      // RFC 2822 veya ISO olsa bile timezone'u YOK SAY ve yerel saat kabul et
      // 1) ISO: 2025-10-31T10:43:00Z veya +00:00
      const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/)
      if (iso) {
        const y = Number(iso[1]), mo = Number(iso[2]) - 1, d = Number(iso[3])
        const h = Number(iso[4]), mi = Number(iso[5]), s = Number(iso[6] || 0)
        return new Date(y, mo, d, h, mi, s)
      }

      // 2) RFC 2822: Fri, 31 Oct 2025 10:43:00 +0000
      const rfc = input.match(/\b(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/)
      if (rfc) {
        const day = Number(rfc[1])
        const monStr = rfc[2].toLowerCase()
        const y = Number(rfc[3])
        const h = Number(rfc[4])
        const mi = Number(rfc[5])
        const s = Number(rfc[6] || 0)
        const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 }
        const mo = months[monStr] ?? 0
        return new Date(y, mo, day, h, mi, s)
      }
      // dd.MM.yyyy - HH:mm formatını Europe/Istanbul olarak ele al
      const m = input.match(/(\d{1,2})\.(\d{1,2})\.(\d{4}).*?(\d{1,2}):(\d{2})/)
      if (m) {
        const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3])
        const h = Number(m[4]), mi = Number(m[5])
        // Yerel saat olarak kabul et (ortam TZ ne olursa olsun Date local oluşturur)
        return new Date(y, mo, d, h, mi, 0)
      }
      // Fallback
      // Son çare: timezone'u kaldırıp yerel parse et
      const stripped = input.replace(/(Z|GMT|[+-]\d{2}:?\d{2})/gi, '').trim()
      const naive = Date.parse(stripped)
      if (!Number.isNaN(naive)) return new Date(naive)
      return new Date(input)
    }
    return null
  }

  function formatTimeAgo(date, newsSource) {
    const now = new Date(nowTick)
    let parsedDate
    
    // CoinTelegraph için özel işlem: UTC olarak parse et ve +3 saat ekle
    if (newsSource === 'cointelegraph') {
      // Tarihi direkt UTC olarak parse et
      parsedDate = new Date(date)
      if (isNaN(parsedDate.getTime())) {
        parsedDate = parseIstanbulDate(date)
      }
      // UTC'den Türkiye saatine (UTC+3) çevir
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        parsedDate = new Date(parsedDate.getTime() + (3 * 60 * 60 * 1000))
      }
    } else {
      parsedDate = parseIstanbulDate(date)
    }
    
    if (!parsedDate || isNaN(parsedDate.getTime())) return '—'
    
    const diff = now.getTime() - parsedDate.getTime()
    
    // Negatif fark (gelecek tarih) durumunda 0 göster
    if (diff < 0) {
      return '0 dakika önce'
    }
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    
    // 0-59 dakika arası
    if (minutes < 60) {
      if (minutes < 1) return t('justNow') || 'az önce'
      return `${minutes} ${t('minutesAgo')}`
    }
    // 1-23 saat arası
    if (hours < 24) return `${hours} ${t('hoursAgo')}`
    // 24+ saat
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Newspaper className="w-12 h-12 text-primary-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('loading') || 'Haberler yükleniyor...'}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{styles}</style>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-xl flex items-center justify-center shadow-lg`}>
              <Newspaper className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
                {t('cryptoNews') || 'Kripto Haberler'}
              </h1>
            </div>
          </div>
        </div>

        

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchNews') || 'Haberlerde ara...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 mb-6">
          <p className="text-red-600 dark:text-red-400 text-sm">
            {t('errorLoadingNews') || 'Haberler yüklenirken bir hata oluştu:'} {error}
          </p>
        </div>
      )}

      {/* News Grid */}
      {filteredNews.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {searchQuery 
              ? (t('noNewsFound') || 'Aradığınız kriterlere uygun haber bulunamadı')
              : (t('noNews') || 'Henüz haber yok')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 max-h-[calc(100vh-10px)] sm:max-h-[calc(100vh+100px)] overflow-y-auto overflow-x-hidden px-2 sm:px-4 pt-4 sm:pt-6 pb-4 crypto-list-scrollbar">
          {filteredNews.map((item, index) => {
            const ts = new Date(item.publishedAt || item.published_at || item.pubDate || item.date || 0).getTime() || index
            const k = `${item.id || item.url || item.link || item.title}-${ts}`
            const isImportant = isImportantNews(item)
            return (
            <div key={k} className="group relative animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
              <article className={`relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-700/50 overflow-hidden transform transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 hover:scale-[1.005] flex flex-col h-full min-h-[480px] sm:min-h-[400px] group/article ${isImportant ? 'important-news-card' : ''}`}>
                {/* Image */}
                <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 overflow-hidden group-hover/article:scale-105 transition-transform duration-300 aspect-[16/10]">
                 {item.image?.includes('kriptotek.jpg') || item.image === '/kriptotek.jpg' ? (
                   <div className="w-full h-full flex items-center justify-center">
                     <img
                       src={item.image}
                       alt={item.title}
                       className="w-full h-full object-cover object-center"
                       loading="lazy"
                       onError={(e) => {
                         console.warn(`⚠️ Resim yüklenemedi: ${item.image}`)
                         e.target.src = '/kriptotek.jpg'
                       }}
                     />
                   </div>
                 ) : (
                   <div className="w-full h-full flex items-center justify-center">
                     <img
                       src={item.image}
                       alt={item.title}
                       className="w-full h-full object-cover object-center"
                       loading="lazy"
                       onError={(e) => {
                         console.warn(`⚠️ Resim yüklenemedi: ${item.image}`)
                         e.target.src = '/kriptotek.jpg'
                         e.target.className = 'w-full h-full object-cover object-center'
                       }}
                       onLoad={(e) => {
                         if (item.image !== '/kriptotek.jpg' && !item.image?.includes('kriptotek.jpg')) {
                           console.log(`✅ Resim yüklendi: ${item.title.substring(0, 30)}...`)
                         }
                       }}
                     />
                   </div>
                 )}
                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                
                {/* Badges - Top Right */}
                <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5 z-10">
                  {/* Importance Badge - Sadece gerçekten önemli haberler için */}
                  {isImportant && (
                    <div className="group/importance relative">
                      <div className="px-2 py-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-md shadow-md animate-pulse cursor-help">
                        <div className="flex items-center space-x-0.5">
                          <span className="text-xs">🔥</span>
                          <span className="text-[10px] font-bold text-white">{t('important') || 'Önemli'}</span>
                        </div>
                      </div>
                      {/* Tooltip - Yatay (sol taraf) */}
                      <div className="absolute top-[150%] -translate-y-1/2 right-full mr-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/importance:opacity-100 transition-opacity pointer-events-none z-50 w-auto min-w-[160px] sm:min-w-[150px] md:min-w-[200px] max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-sm whitespace-normal break-words">
                        <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900"></div>
                      <div className="font-semibold mb-1">⚡ {t('highPriorityNews')}</div>
                      <div className="text-gray-300 text-[10px] leading-relaxed">{t('criticalImportance')}</div>
                      <div className="text-gray-400 text-[9px] mt-1 leading-relaxed">{t('recordOrImportant')}</div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Sentiment & Category - Bottom with Glass Effect */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10">
                  {/* Sentiment Badge - Her zaman göster */}
                  <div className="group/sentiment relative">
                    <div className={`px-2 py-1 backdrop-blur-md rounded-md border shadow-md cursor-help ${
                      (() => {
                        // Sentiment analizi: title ve description'a göre
                        const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                        if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                          return 'bg-emerald-500/20 border-emerald-400/30'
                        } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                          return 'bg-rose-500/20 border-rose-400/30'
                        }
                        return 'bg-slate-500/20 border-slate-400/30'
                      })()
                    }`}>
                      <div className="flex items-center space-x-1">
                        <span className="text-sm">{(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                            return '📈'
                          } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                            return '📉'
                          }
                          return '📰'
                        })()}</span>
                        <span className={`text-[10px] font-bold ${
                          (() => {
                            const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                            if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                              return 'text-emerald-100'
                            } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                              return 'text-rose-100'
                            }
                            return 'text-slate-100'
                          })()
                        }`}>
                          {(() => {
                            const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                            if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                              return t('positive')
                            } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                              return t('negative')
                            }
                            return t('neutral')
                          })()}
                        </span>
                      </div>
                    </div>
                    {/* Tooltip - Yatay (sağ taraf) */}
                    <div className="absolute top-[30%] -translate-y-1/2 left-full ml-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/sentiment:opacity-100 transition-opacity pointer-events-none z-50 w-auto min-w-[140px] sm:min-w-[130px] md:min-w-[180px] max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-sm whitespace-normal break-words">
                      <div className="font-semibold mb-1">
                        {(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                            return `📈 ${t('positiveNews')}`
                          } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                            return `📉 ${t('negativeNews')}`
                          }
                          return `📰 ${t('neutralNews')}`
                        })()}
                      </div>
                      <div className="text-gray-300 text-[10px] leading-relaxed">
                        {(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                            return t('positiveNewsDesc')
                          } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                            return t('negativeNewsDesc')
                          }
                          return t('neutralNewsDesc')
                        })()}
                      </div>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                    </div>
                  </div>
                  
                  {/* Category Badge - Her zaman göster (coin analizi ile) */}
                  <div className="group/category relative">
                      <div className="px-2 py-1 bg-white/10 backdrop-blur-md rounded-md border border-white/20 shadow-md cursor-help">
                        <span className="text-[10px] font-semibold text-white">
                          {(() => {
                            // Category analizi: title ve description'a göre
                            const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                            if (text.includes('bitcoin') || text.includes('btc')) return '₿'
                            if (text.includes('ethereum') || text.includes('eth')) return 'Ξ'
                            if (text.includes('defi') || text.includes('decentralized')) return '🏦'
                            if (text.includes('nft')) return '🖼️'
                            if (text.includes('regülasyon') || text.includes('regulation') || text.includes('yasak') || text.includes('yasal')) return '⚖️'
                            if (text.includes('borsa') || text.includes('exchange') || text.includes('binance') || text.includes('coinbase')) return '🏪'
                            if (text.includes('piyasa') || text.includes('market') || text.includes('fiyat')) return '📊'
                            return '💎' // Varsayılan: altcoin
                          })()}
                        </span>
                      </div>
                      {/* Tooltip - Yatay (sol taraf) */}
                      <div className="absolute top-[30%] -translate-y-1/2 right-full mr-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/category:opacity-100 transition-opacity pointer-events-none z-50 w-auto min-w-[120px] sm:min-w-[110px] md:min-w-[150px] max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-sm whitespace-normal break-words">
                        <div className="font-semibold mb-1">{t('category')}</div>
                        <div className="text-gray-300 text-[10px] leading-relaxed">
                          {(() => {
                            const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                            if (text.includes('bitcoin') || text.includes('btc')) return `₿ ${t('categoryBitcoin')}`
                            if (text.includes('ethereum') || text.includes('eth')) return `Ξ ${t('categoryEthereum')}`
                            if (text.includes('defi') || text.includes('decentralized')) return `🏦 ${t('categoryDefi')}`
                            if (text.includes('nft')) return `🖼️ ${t('categoryNft')}`
                            if (text.includes('regülasyon') || text.includes('regulation') || text.includes('yasak') || text.includes('yasal')) return `⚖️ ${t('categoryRegulation')}`
                            if (text.includes('borsa') || text.includes('exchange') || text.includes('binance') || text.includes('coinbase')) return `🏪 ${t('categoryExchange')}`
                            if (text.includes('piyasa') || text.includes('market') || text.includes('fiyat')) return `📊 ${t('categoryMarket')}`
                            return `💎 ${t('categoryAltcoin')}`
                          })()}
                        </div>
                        <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900"></div>
                      </div>
                    </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-2.5 sm:p-3 flex-1 flex flex-col min-h-0">
                <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-1.5 line-clamp-2 hover:text-primary-600 dark:hover:text-primary-400 transition-colors leading-tight">
                  {item.title}
                </h2>
                
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5 line-clamp-2 flex-1 leading-relaxed min-h-[2.5rem]">
                  {item.description && item.description.length > 150 
                    ? item.description.substring(0, 150).trim() + '...' 
                    : item.description}
                </p>
                
                {/* Analysis Summary */}
                <div className="border-b border-gray-100 dark:border-gray-700"></div>
                <div className="flex items-center justify-center space-x-1.5 py-1.5">
                  {/* Impact Indicator - Her zaman göster */}
                  <div className="group/impact relative">
                    <div className={`flex items-center justify-center space-x-1 px-2 py-1 rounded-md cursor-help min-w-[80px] h-6 ${
                      (() => {
                        const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                        if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                          return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                          return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        }
                        return 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                      })()
                    }`}>
                      <span className="text-[10px] font-medium">
                        {(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                            return t('positiveForMarket')
                          } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                            return t('needsCaution')
                          }
                          return t('informationalOnly')
                        })()}
                      </span>
                    </div>
                    {/* Tooltip - Yatay (sağ taraf) */}
                    <div className="absolute top-[30%] -translate-y-1/2 left-full ml-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/impact:opacity-100 transition-opacity pointer-events-none z-50 w-auto min-w-[120px] sm:min-w-[110px] md:min-w-[150px] max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-sm whitespace-normal break-words">
                        <div className="font-semibold mb-1">{t('marketImpactAnalysis')}</div>
                      <div className="text-gray-300 text-[10px] leading-relaxed">
                        {(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('yüksel') || text.includes('art') || text.includes('pozitif') || text.includes('olumlu') || text.includes('bull') || text.includes('pump')) {
                            return t('positiveForMarket') || 'Piyasa için olumlu'
                          } else if (text.includes('düş') || text.includes('azal') || text.includes('negatif') || text.includes('olumsuz') || text.includes('bear') || text.includes('dump') || text.includes('düşüş')) {
                            return t('negativeForMarket') || 'Piyasa için olumsuz'
                          }
                          return t('aiAnalysisNeutral') || 'Bilgi amaçlı'
                        })()}
                      </div>
                      <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                    </div>
                  </div>
                  
                  {/* Category Tag - Her zaman göster */}
                  <div className="group/cat relative">
                    <div className="flex items-center justify-center px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 cursor-help min-w-[80px] h-6">
                      <span className="text-[10px] font-medium">
                        {(() => {
                          const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                          if (text.includes('bitcoin') || text.includes('btc')) return t('bitcoin')
                          if (text.includes('ethereum') || text.includes('eth')) return t('ethereum')
                          if (text.includes('defi') || text.includes('decentralized')) return t('defi')
                          if (text.includes('nft')) return t('nft')
                          if (text.includes('regülasyon') || text.includes('regulation') || text.includes('yasak') || text.includes('yasal')) return t('regulation')
                          if (text.includes('borsa') || text.includes('exchange') || text.includes('binance') || text.includes('coinbase')) return t('exchange')
                          if (text.includes('piyasa') || text.includes('market') || text.includes('fiyat')) return t('market')
                          return t('altcoin')
                        })()}
                      </span>
                    </div>
                      {/* Tooltip - Yatay (sol taraf) */}
                      <div className="absolute top-[30%] -translate-y-1/2 right-full mr-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover/cat:opacity-100 transition-opacity pointer-events-none z-50 w-auto min-w-[120px] sm:min-w-[110px] md:min-w-[150px] max-w-[calc(100vw-3rem)] sm:max-w-xs md:max-w-sm whitespace-normal break-words">
                        <div className="font-semibold mb-1">{t('newsCategory')}</div>
                        <div className="text-gray-300 text-[10px] leading-relaxed">
                          {(() => {
                            const text = (item.title + ' ' + (item.description || '')).toLowerCase()
                            if (text.includes('bitcoin') || text.includes('btc')) return t('categoryBitcoinShort')
                            if (text.includes('ethereum') || text.includes('eth')) return t('categoryEthereumShort')
                            if (text.includes('defi') || text.includes('decentralized')) return t('categoryDefiShort')
                            if (text.includes('nft')) return t('categoryNftShort')
                            if (text.includes('regülasyon') || text.includes('regulation') || text.includes('yasak') || text.includes('yasal')) return t('categoryRegulationShort')
                            if (text.includes('borsa') || text.includes('exchange') || text.includes('binance') || text.includes('coinbase')) return t('categoryExchangeShort')
                            if (text.includes('piyasa') || text.includes('market') || text.includes('fiyat')) return t('categoryMarketShort')
                            return t('categoryAltcoinShort')
                          })()}
                        </div>
                        <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-gray-900"></div>
                      </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className="flex items-center space-x-1.5 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{formatTimeAgo(item.publishedAt, item.source)}</span>
                  </div>

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 text-[10px] sm:text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                  >
                    <span>{t('readMore') || 'Devamı'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              </article>
            </div>)
          })}
        </div>
      )}
    </div>
    </>
  )
}

export default News

