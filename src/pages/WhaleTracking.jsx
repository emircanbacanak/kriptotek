import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useTheme } from '../contexts/ThemeContext'
import multiExchangeWhaleService from '../services/multiExchangeWhaleService'
import { formatCurrency, formatLargeNumber } from '../utils/currencyConverter'
import {
  Waves,
  Search,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  Sparkles,
  AlertCircle
} from 'lucide-react'
import { updatePageSEO } from '../utils/seoMetaTags'
import logger from '../utils/logger'

const WhaleTracking = () => {
  const { t, language } = useLanguage()
  const { currency } = useCurrency()
  const { isDark } = useTheme()

  const [whaleTrades, setWhaleTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCurrency, setFilterCurrency] = useState('all')
  const [minValue, setMinValue] = useState(200000) // $200K - Varsayılan minimum
  const [inputValue, setInputValue] = useState('200000') // Input için ayrı state
  const [minValueError, setMinValueError] = useState('') // Minimum değer hatası
  const [saveSuccess, setSaveSuccess] = useState(false) // Kaydetme başarı durumu

  const whaleUnsubscribeRef = useRef(null)
  const wsRef = useRef(null)

  // PERFORMANS: Batch update için ref'ler
  const pendingTradesRef = useRef([]) // Bekleyen trade'ler
  const batchUpdateTimerRef = useRef(null) // Batch update timer
  const getApiUrl = () => {
    if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
    if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
    if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
      return window.location.origin
    }
    return 'http://localhost:3000'
  }

  const getWebSocketUrl = () => {
    const apiUrl = getApiUrl()
    // WebSocket URL'i oluştur
    if (apiUrl.startsWith('https://')) {
      return apiUrl.replace('https://', 'wss://') + '/ws'
    } else if (apiUrl.startsWith('http://')) {
      return apiUrl.replace('http://', 'ws://') + '/ws'
    }
    return 'ws://localhost:3000/ws'
  }

  useEffect(() => {
    updatePageSEO('whaleTracking', language)
  }, [language])

  // Cache'den veri yükle (son 24 saat)
  const loadCachedData = useCallback(async () => {
    try {
      setLoading(true)
      const apiUrl = getApiUrl()
      logger.log(`🔍 Cache'den trade'ler yükleniyor: ${apiUrl}/api/whale/recent-trades`)

      // 24 saat öncesini hesapla
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)

      const response = await fetch(`${apiUrl}/api/whale/recent-trades?minValue=${minValue}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (response.ok) {
        const result = await response.json()
        logger.log('📦 Cache response:', result)

        if (result.success && result.trades) {
          // Cache'den gelen trade'leri ekle ve timestamp'leri Date objesine çevir
          // Backend zaten 24 saatlik filtreleme yapıyor, ama ekstra güvenlik için frontend'de de filtrele
          const cachedTrades = result.trades
            .map(trade => ({
              ...trade,
              timestamp: trade.timestamp ? new Date(trade.timestamp) : new Date(),
              // Eksik alanları doldur
              source: trade.source || 'unknown',
              type: trade.type || (trade.isBuyerMaker === false ? 'buy' : 'sell')
            }))
            .filter(trade => {
              // ID kontrolü
              if (!trade.id) return false
              // 24 saat kontrolü (ekstra güvenlik)
              const tradeTime = trade.timestamp ? new Date(trade.timestamp).getTime() : 0
              return tradeTime >= twentyFourHoursAgo
            })

          if (cachedTrades.length > 0) {
            setWhaleTrades(cachedTrades)
            logger.log(`✅ Cache'den ${cachedTrades.length} trade yüklendi (son 24 saat)`)
          } else {
            logger.log('⚠️ Cache\'de trade bulunamadı (son 24 saat içinde)')
          }
        } else {
          logger.log('⚠️ Cache\'de trade verisi yok veya format hatalı')
        }
      } else {
        const errorText = await response.text().catch(() => 'Unknown error')
        logger.warn(`Cache yükleme hatası: ${response.status} - ${errorText}`)
      }
    } catch (error) {
      logger.warn('Cache yükleme hatası:', error)
    } finally {
      setLoading(false)
    }
  }, [minValue])

  // PERFORMANS: Bekleyen trade'leri batch olarak işle (500ms'de bir)
  const flushPendingTrades = useCallback(() => {
    if (pendingTradesRef.current.length === 0) return

    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
    const newTrades = [...pendingTradesRef.current]
    pendingTradesRef.current = [] // Temizle

    setWhaleTrades(prev => {
      // Mevcut trade ID'lerini al (hızlı lookup için Set kullan)
      const existingIds = new Set(prev.map(t => `${t.id}-${t.source}-${t.timestamp?.getTime?.() || t.timestamp}`))

      // Sadece yeni trade'leri filtrele
      const uniqueNewTrades = newTrades.filter(trade => {
        const tradeKey = `${trade.id}-${trade.source}-${trade.timestamp?.getTime?.() || new Date(trade.timestamp).getTime()}`
        return !existingIds.has(tradeKey)
      })

      if (uniqueNewTrades.length === 0) return prev

      // Yeni trade'leri ekle ve filtrele
      const allTrades = [...uniqueNewTrades, ...prev]
      const recentTrades = allTrades
        .filter(t => {
          const tradeTime = t.timestamp ? new Date(t.timestamp).getTime() : 0
          return tradeTime >= twentyFourHoursAgo
        })
        .slice(0, 200)

      // Backend'e kaydet (batch olarak)
      if (uniqueNewTrades.length > 0) {
        saveTradesToBackend(uniqueNewTrades)
      }

      return recentTrades
    })
  }, [saveTradesToBackend])

  // PERFORMANS: Trade'i batch'e ekle (hemen state güncellemez)
  const addTradeToBatch = useCallback((trade) => {
    const tradeTimestamp = trade.timestamp instanceof Date ? trade.timestamp : new Date(trade.timestamp)
    pendingTradesRef.current.push({
      ...trade,
      timestamp: tradeTimestamp
    })

    // Timer yoksa başlat (1000ms sonra flush - performans için artırıldı)
    if (!batchUpdateTimerRef.current) {
      batchUpdateTimerRef.current = setTimeout(() => {
        batchUpdateTimerRef.current = null
        flushPendingTrades()
      }, 1000) // 1000ms (500ms'den artırıldı - performans için)
    }
  }, [flushPendingTrades])

  // Trade'leri backend'e kaydet
  const saveTradesToBackend = useCallback(async (trades) => {
    if (!trades || trades.length === 0) return

    try {
      // Trade'leri serialize et (Date objelerini timestamp'e çevir)
      const serializedTrades = trades.map(trade => ({
        ...trade,
        timestamp: trade.timestamp instanceof Date ? trade.timestamp.getTime() : trade.timestamp
      }))

      const response = await fetch(`${getApiUrl()}/api/whale/trades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ trades: serializedTrades })
      })

      if (response.ok) {
        logger.log(`✅ ${trades.length} trade backend'e kaydedildi`)
      } else {
        logger.warn('Trade kaydetme hatası:', await response.text())
      }
    } catch (error) {
      logger.warn('Trade kaydetme hatası:', error)
    }
  }, [])

  // Periyodik whale trade kontrolü (Her dakika bir kez)
  const startPeriodicTracking = useCallback(() => {
    // Minimum değeri ayarla
    multiExchangeWhaleService.setMinTradeValue(minValue)

    // PERFORMANS: Trade handler - batch update kullan
    const handleTrade = (trade) => {
      addTradeToBatch(trade)
    }

    // Periyodik tracking'i başlat
    if (!multiExchangeWhaleService.isConnected && !whaleUnsubscribeRef.current) {
      multiExchangeWhaleService.start()
      whaleUnsubscribeRef.current = multiExchangeWhaleService.subscribe(handleTrade)
    }
  }, [minValue, addTradeToBatch])

  // WebSocket bağlantısı - gerçek zamanlı trade güncellemeleri için
  useEffect(() => {
    const wsUrl = getWebSocketUrl()
    logger.log(`🔌 WebSocket bağlantısı kuruluyor: ${wsUrl}`)

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      logger.log('✅ WebSocket bağlantısı kuruldu (whale trades için)')
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)

        // Whale trade mesajı kontrolü
        if (message.type === 'whale_trade' && message.trade) {
          const trade = message.trade
          const tradeTimestamp = trade.timestamp ? new Date(trade.timestamp) : new Date()

          // Minimum değer kontrolü
          const tradeValue = trade.tradeValue || (trade.price * trade.quantity || 0)
          if (tradeValue < minValue) {
            return // Minimum değerin altındaysa ekleme
          }

          // 24 saat kontrolü
          const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)
          const tradeTime = tradeTimestamp.getTime()
          if (tradeTime < twentyFourHoursAgo) {
            return // 24 saatten eskiyse ekleme
          }

          // PERFORMANS: Batch update kullan (direkt state güncelleme yerine)
          addTradeToBatch({
            ...trade,
            timestamp: tradeTimestamp,
            source: trade.source || 'unknown',
            type: trade.type || (trade.isBuyerMaker === false ? 'buy' : 'sell')
          })
        }
      } catch (error) {
        logger.warn('WebSocket mesaj parse hatası:', error)
      }
    }

    ws.onerror = (error) => {
      logger.warn('WebSocket hatası:', error)
    }

    ws.onclose = () => {
      logger.log('📡 WebSocket bağlantısı kapatıldı, yeniden bağlanılıyor...')
      // Yeniden bağlanmayı dene (5 saniye sonra)
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          // useEffect tekrar çalışacak ve yeni bağlantı kuracak
        }
      }, 5000)
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, []) // Sadece mount/unmount'ta bağlan/kapat

  // İlk yükleme
  useEffect(() => {
    let isActive = true

    // Cache'den veri yükle
    loadCachedData()

    // Periyodik tracking'i başlat (kısa gecikme ile React Strict Mode için)
    const connectTimer = setTimeout(() => {
      if (isActive) {
        startPeriodicTracking()
      }
    }, 300)

    return () => {
      isActive = false
      clearTimeout(connectTimer)

      // PERFORMANS: Batch timer'ı temizle
      if (batchUpdateTimerRef.current) {
        clearTimeout(batchUpdateTimerRef.current)
        batchUpdateTimerRef.current = null
      }

      // Cleanup - unsubscribe'ları temizle
      if (whaleUnsubscribeRef.current) {
        whaleUnsubscribeRef.current()
        whaleUnsubscribeRef.current = null
      }

      // Disconnect'i geciktir - React Strict Mode double mount için
      const disconnectTimer = setTimeout(() => {
        // Sadece gerçekten unmount olduysa disconnect et
        if (!isActive && multiExchangeWhaleService.isConnected) {
          multiExchangeWhaleService.stop()
        }
      }, 500)

      return () => {
        clearTimeout(disconnectTimer)
      }
    }
  }, [loadCachedData, startPeriodicTracking])

  // İlk yüklemede varsayılan minimum değeri ayarla
  useEffect(() => {
    if (multiExchangeWhaleService.isConnected) {
      multiExchangeWhaleService.setMinTradeValue(minValue)
    }
  }, [])

  // Periyodik olarak eski trade'leri temizle (her 5 dakikada bir)
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)

      setWhaleTrades(prev => {
        const recentTrades = prev.filter(trade => {
          const tradeTime = trade.timestamp ? new Date(trade.timestamp).getTime() : 0
          return tradeTime >= twentyFourHoursAgo
        })

        if (recentTrades.length !== prev.length) {
          logger.log(`🧹 ${prev.length - recentTrades.length} eski whale trade temizlendi (24 saatten eski)`)
        }

        return recentTrades
      })
    }, 5 * 60 * 1000) // Her 5 dakikada bir temizle

    return () => clearInterval(cleanupInterval)
  }, [])

  // Filtrelenmiş whale trades (son 24 saat)
  const filteredTrades = useMemo(() => {
    // 24 saat öncesini hesapla
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000)

    // Önce 24 saat içindeki trade'leri filtrele
    let filtered = whaleTrades.filter(trade => {
      const tradeTime = trade.timestamp ? new Date(trade.timestamp).getTime() : 0
      return tradeTime >= twentyFourHoursAgo
    })

    // Arama filtresi
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(trade =>
        trade.symbol?.toLowerCase().includes(searchLower)
      )
    }

    // Coin filtresi
    if (filterCurrency !== 'all') {
      filtered = filtered.filter(trade => trade.symbol === filterCurrency)
    }

    // Minimum değer filtresi (zaten WebSocket'te filtreleniyor ama ekstra kontrol)
    filtered = filtered.filter(trade => trade.tradeValue >= minValue)

    return filtered
  }, [whaleTrades, searchTerm, filterCurrency, minValue])

  // Benzersiz coin listesi
  const uniqueCurrencies = useMemo(() => {
    const currencies = new Set()
    whaleTrades.forEach(trade => {
      if (trade.symbol) {
        currencies.add(trade.symbol)
      }
    })
    return Array.from(currencies).sort()
  }, [whaleTrades])



  const headerIconGradient = useMemo(() => isDark ? 'from-yellow-600 to-orange-600' : 'from-blue-500 to-indigo-500', [isDark])
  const headerTextGradient = useMemo(() => isDark ? 'from-yellow-400 to-orange-400' : 'from-blue-600 to-indigo-600', [isDark])

  if (loading && whaleTrades.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/20 flex items-center justify-center">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-blue-200/50 dark:border-blue-900/50 rounded-full"></div>
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/20 animate-fade-in">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 lg:py-12">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8 animate-fade-in">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110 flex-shrink-0`}>
                <Waves className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <h1 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient} break-words`}>
                    {t('whaleTracking') || 'Whale Tracking'}
                  </h1>
                  <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-full border border-green-200 dark:border-green-800 shadow-sm flex-shrink-0">
                    <Activity className="w-3 h-3 sm:w-4 text-green-600 dark:text-green-400 animate-pulse" />
                    <span className="text-xs sm:text-sm font-medium text-green-600 dark:text-green-400">{t('live') || 'Canlı'}</span>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 text-xs sm:text-sm md:text-base break-words">
                  {t('whaleTrackingDescription') || 'Binance, Bybit, KuCoin, OKX, Bitget, Gate.io, HTX ve MEXC üzerinden büyük işlemleri takip edin. Veriler gerçek zamanlı olarak güncellenir.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-4 sm:p-5 md:p-6 mb-6 sm:mb-8 animate-fade-in transform transition-all duration-300 hover:shadow-xl">
          <div className="space-y-4 md:space-y-6">
            {/* Search */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-lg sm:rounded-xl blur"></div>
              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                <input
                  type="text"
                  placeholder={t('searchWhaleTransactions') || 'Coin ara...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 sm:pl-10 md:pl-12 pr-7 sm:pr-8 md:pr-10 py-2 sm:py-2.5 md:py-3 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200 text-sm sm:text-base text-gray-900 dark:text-white placeholder-gray-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* Currency Filter */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {t('currency') || 'Coin'}
                </label>
                <select
                  value={filterCurrency}
                  onChange={(e) => setFilterCurrency(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl text-sm sm:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                >
                  <option value="all">{t('all') || 'Tümü'}</option>
                  {uniqueCurrencies.map(curr => (
                    <option key={curr} value={curr}>{curr}</option>
                  ))}
                </select>
              </div>

              {/* Min Value Filter - Manuel Giriş */}
              <div>
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {t('minValue') || 'Min. Değer (USD)'}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputValue}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '') // Sadece rakam
                    setInputValue(value)
                    setSaveSuccess(false) // Başarı mesajını temizle

                    // Minimum değer kontrolü
                    const numValue = parseFloat(value) || 0
                    if (value && numValue < 200000) {
                      setMinValueError('Minimum değer $200,000 olmalıdır')
                    } else {
                      setMinValueError('')
                    }
                  }}
                  onBlur={(e) => {
                    // Input'tan çıkıldığında boşsa varsayılan değeri koy
                    if (!e.target.value || e.target.value.trim() === '') {
                      setInputValue('200000')
                      setMinValueError('')
                    }
                  }}
                  className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 md:py-3 bg-white/50 dark:bg-gray-800/50 border ${minValueError ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'
                    } rounded-lg sm:rounded-xl text-sm sm:text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all duration-200 placeholder-gray-400`}
                  placeholder="200000"
                />
                {minValueError && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {minValueError}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                  {t('minValueDescription') || 'Minimum değer: $200,000. Bu değerin üzerindeki işlemler gösterilir.'}
                </p>
              </div>

              {/* Save Button */}
              <div className="flex flex-col">
                <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 opacity-0 pointer-events-none">
                  {t('save') || 'Kaydet'}
                </label>
                <button
                  onClick={() => {
                    const numValue = parseFloat(inputValue) || 200000
                    if (numValue < 200000) {
                      setMinValueError('Minimum değer $200,000 olmalıdır')
                      setInputValue('200000')
                      setMinValue(200000)
                      setSaveSuccess(false)
                    } else {
                      setMinValueError('')
                      setMinValue(numValue)
                      setSaveSuccess(true)
                      // Minimum değeri güncelle
                      if (multiExchangeWhaleService.isConnected) {
                        multiExchangeWhaleService.setMinTradeValue(numValue)
                      }
                      // 2 saniye sonra başarı mesajını gizle
                      setTimeout(() => setSaveSuccess(false), 2000)
                    }
                  }}
                  disabled={!!minValueError || loading}
                  className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg sm:rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:hover:scale-100 flex items-center justify-center gap-2 relative"
                >
                  {saveSuccess && (
                    <span className="absolute -top-2 -right-2 w-3 h-3 bg-green-500 rounded-full animate-ping"></span>
                  )}
                  <Activity className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />
                  <span className="text-sm sm:text-base">{saveSuccess ? (t('saved') || 'Kaydedildi!') : (t('save') || 'Kaydet')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Whale Trades */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-700/50 p-4 sm:p-5 md:p-6 animate-fade-in transform transition-all duration-300 hover:shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500 animate-pulse" />
              {t('realTimeWhaleTrades') || 'Gerçek Zamanlı Whale İşlemleri'}
            </h2>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <span className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">
                {filteredTrades.length}
              </span>
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {t('trades') || 'işlem'}
              </span>
            </div>
          </div>
          {loading ? (
            <div className="text-center py-12">
              <div className="relative mx-auto w-16 h-16 mb-4">
                <div className="absolute inset-0 border-4 border-blue-200/50 dark:border-blue-900/50 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" />
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('loading') || 'Yükleniyor...'}</p>
            </div>
          ) : filteredTrades.length > 0 ? (
            <div className="space-y-2 max-h-[600px] sm:max-h-[700px] overflow-y-auto crypto-list-scrollbar">
              {filteredTrades.map((trade, index) => (
                <div
                  key={trade.id || index}
                  className="group/trade relative animate-fade-in transform transition-all duration-300 hover:-translate-y-0.5"
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-xl opacity-0 group-hover/trade:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-gray-50/80 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-200/50 dark:border-gray-700/50 hover:border-blue-300/50 dark:hover:border-blue-600/50 hover:shadow-lg transition-all duration-300 gap-3"
                  >
                    {/* Üst satır - Symbol, Exchange, Type (mobilde) */}
                    <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-sm ${trade.type === 'buy' ? 'bg-green-500 dark:bg-green-400' : 'bg-red-500 dark:bg-red-400'} animate-pulse`}></div>
                      <span className="font-bold text-sm sm:text-base md:text-lg text-gray-900 dark:text-white truncate">{trade.symbol}</span>
                      <span className="text-xs px-2 py-0.5 sm:py-1 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800 font-semibold shadow-sm flex-shrink-0">
                        {trade.source === 'binance' || trade.source === 'binance_realtime' ? 'BN' :
                          trade.source === 'kucoin' || trade.source === 'kucoin_realtime' ? 'KC' :
                            trade.source === 'bybit' || trade.source === 'bybit_realtime' ? 'BY' :
                              trade.source === 'okx' || trade.source === 'okx_realtime' ? 'OK' :
                                trade.source === 'bitget' || trade.source === 'bitget_realtime' ? 'BG' :
                                  trade.source === 'gateio' || trade.source === 'gateio_realtime' ? 'GT' :
                                    trade.source === 'htx' || trade.source === 'htx_realtime' ? 'HT' :
                                      trade.source === 'mexc' || trade.source === 'mexc_realtime' ? 'MX' : '?'}
                      </span>
                      {/* Mobilde type badge */}
                      <div className={`sm:hidden px-2 py-0.5 rounded-lg border font-semibold flex items-center gap-1 text-xs transition-all duration-300 ${trade.type === 'buy'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                        }`}>
                        {trade.type === 'buy' ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        <span>{trade.type === 'buy' ? '↑' : '↓'}</span>
                      </div>
                    </div>

                    {/* Orta satır - Quantity ve Price (mobilde) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 sm:flex-1 sm:min-w-0">
                      <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 sm:hidden">
                        {formatLargeNumber(trade.quantity)} @ {formatCurrency(trade.price, currency)}
                      </span>
                      <span className="hidden sm:inline text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                        {formatLargeNumber(trade.quantity)} @ {formatCurrency(trade.price, currency)}
                      </span>
                      <span className="text-xs sm:text-sm md:text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                        = {formatCurrency(trade.tradeValue, currency)}
                      </span>
                    </div>

                    {/* Alt satır - Type ve Tarih (mobilde) */}
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
                      {/* Desktop'ta type badge */}
                      <div className={`hidden sm:flex px-2 sm:px-3 py-1 rounded-lg border font-semibold items-center gap-1.5 text-xs sm:text-sm transition-all duration-300 ${trade.type === 'buy'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                        }`}>
                        {trade.type === 'buy' ? (
                          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                        ) : (
                          <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />
                        )}
                        <span>{trade.type === 'buy' ? t('buy') || 'Alış' : t('sell') || 'Satış'}</span>
                      </div>
                      <span className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-gray-400 font-mono px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 dark:bg-gray-700/50 rounded-lg whitespace-nowrap">
                        <span className="hidden sm:inline">
                          {trade.timestamp.toLocaleString('tr-TR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                        <span className="sm:hidden">
                          {trade.timestamp.toLocaleString('tr-TR', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl shadow-2xl animate-fade-in">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-500 dark:from-blue-600 dark:via-indigo-700 dark:to-purple-600"></div>
              <div className="relative z-10 p-8 sm:p-12 text-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-lg border border-white/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <Activity className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">{t('waitingForTrades') || 'Büyük işlemler bekleniyor...'}</h3>
                <p className="text-blue-100 text-sm sm:text-base">{t('minTradeValue') || 'Minimum işlem değeri'}: <span className="font-semibold text-white">{formatCurrency(minValue, currency)}</span></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WhaleTracking
