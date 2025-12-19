import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from 'recharts'
import { formatCurrency, formatLargeCurrency } from '../utils/currencyConverter'
import { TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart3, Activity, DollarSign, Gauge, ArrowUpRight, ArrowDownRight, Sparkles } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useTheme } from '../contexts/ThemeContext'
import useDominanceData from '../hooks/useDominanceData'
import { updatePageSEO } from '../utils/seoMetaTags'

const Dominance = () => {
  const { t, language } = useLanguage()
  const { currency } = useCurrency()
  const { isDark } = useTheme()

  // Merkezi veri yönetim sisteminden veri al
  const {
    dominanceData: rawDominanceData,
    fearGreedIndex,
    loading,
    error,
    refresh
  } = useDominanceData()

  useEffect(() => {
    updatePageSEO('marketOverview', language)
  }, [language])

  const [dominanceData, setDominanceData] = useState([])
  const [volumeData, setVolumeData] = useState([])
  const [historicalData, setHistoricalData] = useState([])
  const [global, setGlobal] = useState(null)
  const [topCoins, setTopCoins] = useState([])
  const [dominanceTableData, setDominanceTableData] = useState([])
  const [yDomainLeft, setYDomainLeft] = useState([0, 100])
  const [yDomainRight, setYDomainRight] = useState([0, 100])

  const processDominanceData = useCallback((data) => {
    if (!data) {
      console.warn('⚠️ processDominanceData: data null veya undefined')
      return
    }

    // Veri geçerliliğini kontrol et
    if (!data.global || !data.dominanceData || data.dominanceData.length === 0) {
      console.warn('⚠️ processDominanceData: Veri eksik veya boş', {
        hasGlobal: !!data.global,
        hasDominanceData: !!data.dominanceData,
        dominanceDataLength: data.dominanceData?.length || 0
      })
      return
    }


    // Ortak veri kaynağından tüm verileri al - dominanceData'dan BTC ve ETH'yi kullan
    const btcData = data.dominanceData.find(d => d.name === 'BTC')
    const ethData = data.dominanceData.find(d => d.name === 'ETH')

    setDominanceData(data.dominanceData || [])

    // Volume data'yı filtrele - stabilcoinler hariç, ilk 5 coin
    const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDD', 'LUSD', 'FEI', 'UST', 'MIM', 'EURS', 'EURT', 'USDE', 'PYUSD', 'USDF', 'FDUSD', 'USDS', 'USDG', 'RLUSD', 'USYC', 'USD0', 'USD1', 'USDT0', 'USDTB', 'BFUSD', 'SUSDS', 'SUSDE', 'OUSG', 'BUILD', 'C1USD', 'EURC', 'CRVUSD', 'SDAI', 'DUSD', 'CUSDO', 'WSTUSR', 'USR', 'CUSD', 'USDA', 'USDO', 'USX', 'USDB', 'FDIT']
    const filteredVolumeData = (data.volumeData || [])
      .filter(coin => {
        const symbol = coin.name?.toUpperCase() || coin.symbol?.toUpperCase() || ''
        return !STABLECOIN_SYMBOLS.includes(symbol) && !symbol.includes('USD') && !symbol.includes('USDT') && !symbol.includes('USDC')
      })
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5) // İlk 5 coin
    setVolumeData(filteredVolumeData)

    // Historical data'yı MongoDB'den gelen veriden al
    const historical = data.historicalData || []
    if (historical.length === 0) {
      // İlk veri için boş array gönder (grafik gösterilmez)
      setHistoricalData([])
    } else {
      // Historical data'yı düzgün formatta set et - MongoDB'den gelen formatı koru
      const formattedHistorical = historical.map(h => {
        const coin1 = h.coin1 !== undefined && h.coin1 !== null ? Number(h.coin1) : null
        const coin2 = h.coin2 !== undefined && h.coin2 !== null ? Number(h.coin2) : null
        const others = h.others !== undefined && h.others !== null ? Number(h.others) : null

        // Geçerli veri kontrolü
        if (coin1 === null || isNaN(coin1) || coin2 === null || isNaN(coin2) || others === null || isNaN(others)) {
          return null
        }

        return {
          date: h.date || '',
          coin1: coin1,
          coin2: coin2,
          others: others
        }
      }).filter(h => h !== null && h.date) // Geçersiz ve tarihi olmayan kayıtları filtrele

      // Tarihe göre sırala (en eski en başta)
      formattedHistorical.sort((a, b) => new Date(a.date) - new Date(b.date))

      setHistoricalData(formattedHistorical)
    }

    // Global ve topCoins verilerini kontrol et - Gerçek veri olmalı
    if (!data.global || !data.top3Coins || data.top3Coins.length === 0) {
      console.warn('⚠️ processDominanceData: Global veya top3Coins verisi eksik')
      return
    }

    setGlobal(data.global)
    setTopCoins(data.top3Coins)

    // Hakimiyet Tablosunda sadece BTC ve ETH göster - dominanceData'dan al
    // 24s Değişim: Volume dominance yüzdelik değişimi
    const totalVolume = data.global?.total_volume?.usd || 1
    const tableData = []
    if (btcData && btcData.value !== undefined && btcData.value !== null && !isNaN(btcData.value) &&
      data.top3Coins && data.top3Coins[0] &&
      data.top3Coins[0].market_cap !== undefined && data.top3Coins[0].market_cap !== null &&
      data.top3Coins[0].total_volume !== undefined && data.top3Coins[0].total_volume !== null) {
      // Volume dominance hesapla
      const currentVolumeDominance = data.top3Coins[0].volume_dominance || (data.top3Coins[0].total_volume / totalVolume) * 100

      // Volume dominance değişimini hesapla
      // Önce API'den gelen volume_change_24h'ı kontrol et (varsa kullan)
      let volumeDominanceChange = 0
      if (data.top3Coins[0].volume_change_24h !== null && data.top3Coins[0].volume_change_24h !== undefined) {
        // API'den direkt volume değişimi geliyorsa, volume dominance değişimini hesapla
        // volume_change_24h yüzde cinsinden ise, volume dominance değişimi de yaklaşık olarak aynı olabilir
        // Ancak daha doğru hesaplama için historical data kullanılmalı
        volumeDominanceChange = data.top3Coins[0].volume_change_24h
      } else {
        // API'den gelmiyorsa, historical data'dan hesapla
        let previousVolumeDominance = null
        if (data.historicalData && data.historicalData.length > 0) {
          // Son 24 saat içindeki en eski kaydı bul
          const now = new Date()
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

          // Son 2 günlük veriyi kontrol et (24 saatlik değişim için)
          const recentHistorical = data.historicalData
            .filter(h => h.date && new Date(h.date) >= yesterday)
            .sort((a, b) => new Date(a.date) - new Date(b.date))

          if (recentHistorical.length > 0) {
            const oldestRecent = recentHistorical[0]
            previousVolumeDominance = oldestRecent.btcVolumeDominance
          }
        }

        // Volume dominance değişimini hesapla
        if (previousVolumeDominance !== null && previousVolumeDominance !== undefined && !isNaN(previousVolumeDominance)) {
          volumeDominanceChange = currentVolumeDominance - previousVolumeDominance
        }
      }

      tableData.push({
        name: data.top3Coins[0].name || t('bitcoin'),
        symbol: 'BTC',
        image: data.top3Coins[0].image || '',
        dominance: btcData.value,
        marketCap: data.top3Coins[0].market_cap,
        volume: data.top3Coins[0].total_volume,
        change: volumeDominanceChange, // Volume dominance yüzdelik değişimi
        volumeDominance: currentVolumeDominance // Mevcut volume dominance
      })
    }
    if (ethData && ethData.value !== undefined && ethData.value !== null && !isNaN(ethData.value) &&
      data.top3Coins && data.top3Coins[1] &&
      data.top3Coins[1].market_cap !== undefined && data.top3Coins[1].market_cap !== null &&
      data.top3Coins[1].total_volume !== undefined && data.top3Coins[1].total_volume !== null) {
      // Volume dominance hesapla
      const currentVolumeDominance = data.top3Coins[1].volume_dominance || (data.top3Coins[1].total_volume / totalVolume) * 100

      // Volume dominance değişimini hesapla
      // Önce API'den gelen volume_change_24h'ı kontrol et (varsa kullan)
      let volumeDominanceChange = 0
      if (data.top3Coins[1].volume_change_24h !== null && data.top3Coins[1].volume_change_24h !== undefined) {
        // API'den direkt volume değişimi geliyorsa, volume dominance değişimini hesapla
        volumeDominanceChange = data.top3Coins[1].volume_change_24h
      } else {
        // API'den gelmiyorsa, historical data'dan hesapla
        let previousVolumeDominance = null
        if (data.historicalData && data.historicalData.length > 0) {
          // Son 24 saat içindeki en eski kaydı bul
          const now = new Date()
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

          // Son 2 günlük veriyi kontrol et (24 saatlik değişim için)
          const recentHistorical = data.historicalData
            .filter(h => h.date && new Date(h.date) >= yesterday)
            .sort((a, b) => new Date(a.date) - new Date(b.date))

          if (recentHistorical.length > 0) {
            const oldestRecent = recentHistorical[0]
            previousVolumeDominance = oldestRecent.ethVolumeDominance
          }
        }

        // Volume dominance değişimini hesapla
        if (previousVolumeDominance !== null && previousVolumeDominance !== undefined && !isNaN(previousVolumeDominance)) {
          volumeDominanceChange = currentVolumeDominance - previousVolumeDominance
        }
      }

      tableData.push({
        name: data.top3Coins[1].name || t('ethereum'),
        symbol: 'ETH',
        image: data.top3Coins[1].image || '',
        dominance: ethData.value,
        marketCap: data.top3Coins[1].market_cap,
        volume: data.top3Coins[1].total_volume,
        change: volumeDominanceChange, // Volume dominance yüzdelik değişimi
        volumeDominance: currentVolumeDominance // Mevcut volume dominance
      })
    }
    setDominanceTableData(tableData)
  }, [])

  // Merkezi veri yönetim sisteminden gelen veriyi işle
  useEffect(() => {
    if (rawDominanceData) {
      processDominanceData(rawDominanceData)
    }
  }, [rawDominanceData, processDominanceData])

  useEffect(() => {
    if (!historicalData || historicalData.length === 0) {
      // Varsayılan domain değerleri
      setYDomainLeft([0, 100])
      setYDomainRight([0, 100])
      return
    }

    const coin1Vals = historicalData.map(d => Number(d.coin1)).filter(v => !isNaN(v) && v > 0)
    const coin2Vals = historicalData.map(d => Number(d.coin2)).filter(v => !isNaN(v) && v > 0)

    if (coin1Vals.length > 0) {
      const min1 = Math.min(...coin1Vals)
      const max1 = Math.max(...coin1Vals)
      const range1 = max1 - min1
      const pad1 = range1 * 0.1 || 1 // %10 padding veya minimum 1
      let lower1 = Math.max(0, min1 - pad1)
      let upper1 = Math.min(100, max1 + pad1)

      // Domain'i düzgün ayarla
      if (lower1 >= upper1) {
        lower1 = Math.max(0, min1 - 5)
        upper1 = Math.min(100, max1 + 5)
      }

      setYDomainLeft([Number(lower1.toFixed(1)), Number(upper1.toFixed(1))])
    } else {
      setYDomainLeft([0, 100])
    }

    if (coin2Vals.length > 0) {
      const min2 = Math.min(...coin2Vals)
      const max2 = Math.max(...coin2Vals)
      const range2 = max2 - min2
      const pad2 = range2 * 0.1 || 1 // %10 padding veya minimum 1
      let lower2 = Math.max(0, min2 - pad2)
      let upper2 = Math.min(100, max2 + pad2)

      // Domain'i düzgün ayarla
      if (lower2 >= upper2) {
        lower2 = Math.max(0, min2 - 5)
        upper2 = Math.min(100, max2 + 5)
      }

      setYDomainRight([Number(lower2.toFixed(1)), Number(upper2.toFixed(1))])
    } else {
      setYDomainRight([0, 100])
    }
  }, [historicalData])

  const formatVolume = (volume) => {
    // Veri yoksa veya geçersizse 0 göster (hata olduğunu belirtmek için)
    if (volume === null || volume === undefined || isNaN(volume) || volume === 0) {
      return formatLargeCurrency(0, currency)
    }
    return formatLargeCurrency(volume, currency)
  }

  const formatPercentage = (value) => {
    // Veri yoksa veya geçersizse 0.00 göster (hata olduğunu belirtmek için)
    if (value === null || value === undefined || isNaN(value)) {
      return '0.00'
    }
    return parseFloat(value).toFixed(2)
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg p-4 rounded-xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('volume')}: <span className="font-medium">{formatVolume(payload[0].value)}</span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('dominance')}: <span className="font-medium">%{Math.round(payload[0].payload.dominance)}</span>
          </p>
        </div>
      )
    }
    return null
  }

  const getFearGreedColor = (value) => {
    if (value <= 20) return 'from-red-500 to-red-600'
    if (value <= 40) return 'from-orange-500 to-orange-600'
    if (value <= 60) return 'from-yellow-500 to-yellow-600'
    if (value <= 80) return 'from-lime-500 to-lime-600'
    return 'from-green-500 to-green-600'
  }

  const getFearGreedEmoji = (value) => {
    if (value <= 20) return '😱'
    if (value <= 40) return '😨'
    if (value <= 60) return '😐'
    if (value <= 80) return '😊'
    return '🤑'
  }

  const getFearGreedLabel = (value) => {
    if (value <= 20) return t('extremeFear')
    if (value <= 40) return t('fear')
    if (value <= 60) return t('neutral')
    if (value <= 80) return t('greed')
    return t('extremeGreed')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
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

  if (error) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-red-200/50 dark:border-red-900/50 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {t('dominanceApiErrorTitle')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {error}
          </p>
        </div>
      </div>
    )
  }

  if (!loading && (!dominanceData || dominanceData.length === 0)) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-yellow-200/50 dark:border-yellow-900/50 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {t('dominanceApiErrorTitle')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {t('dominanceApiErrorDesc')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 w-full py-6 sm:py-8 lg:py-12">
      {/* Modern Header */}
      <div className="mb-8 sm:mb-12">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl blur-xl opacity-50"></div>
            <div className="relative bg-gradient-to-br from-blue-500 to-indigo-600 w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-2xl flex items-center justify-center shadow-lg">
              <PieChartIcon className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
              {t('dominanceTitle')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 text-xs sm:text-sm lg:text-base">
              {t('dominanceDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid - Modern Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        {/* Bitcoin Dominance Card */}
        <div className="group relative overflow-hidden bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-yellow-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-xl shadow-lg">
                <PieChartIcon className="w-5 h-5 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              {topCoins[0]?.image && (
                <img
                  src={topCoins[0].image}
                  alt={topCoins[0].name}
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-orange-200 dark:ring-orange-900"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                />
              )}
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                  {(() => {
                    const btcDominance = dominanceData.find(d => d.name === 'BTC')?.value
                    if (btcDominance === undefined || btcDominance === null || isNaN(btcDominance)) {
                      return '0.00'
                    }
                    return `%${formatPercentage(btcDominance)}`
                  })()}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {topCoins[0]?.name || t('bitcoin')} {t('topDominance')}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* BTC Volume Card */}
        <div className="group relative overflow-hidden bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl shadow-lg">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <Activity className="w-5 h-5 text-blue-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {(() => {
                  const btcVolume = topCoins[0]?.total_volume
                  if (btcVolume === undefined || btcVolume === null || isNaN(btcVolume) || btcVolume === 0) {
                    return formatLargeCurrency(0, currency)
                  }
                  return formatLargeCurrency(btcVolume, currency)
                })()}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('totalBtcVolume')}
              </p>
            </div>
          </div>
        </div>

        {/* Market Cap Card */}
        <div className="group relative overflow-hidden bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]">
          <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
              <TrendingUp className="w-5 h-5 text-purple-500" />
            </div>
            <div className="mb-2">
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {(() => {
                  const marketCap = global?.total_market_cap?.usd
                  if (marketCap === undefined || marketCap === null || isNaN(marketCap) || marketCap === 0) {
                    return formatLargeCurrency(0, currency)
                  }
                  return formatLargeCurrency(marketCap, currency)
                })()}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('marketCap')}
              </p>
            </div>
          </div>
        </div>

        {/* Fear & Greed Index Card - Sadece gerçek veri varsa göster */}
        {fearGreedIndex &&
          fearGreedIndex.value !== undefined &&
          fearGreedIndex.value !== null &&
          !isNaN(fearGreedIndex.value) &&
          fearGreedIndex.timestamp &&
          fearGreedIndex.timestamp > 0 && (
            <div className={`group relative overflow-hidden bg-gradient-to-br ${getFearGreedColor(fearGreedIndex.value)}/20 dark:${getFearGreedColor(fearGreedIndex.value)}/10 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6 hover:shadow-2xl transition-all duration-300 hover:scale-[1.02]`}>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 bg-gradient-to-br ${getFearGreedColor(fearGreedIndex.value)} rounded-xl shadow-lg`}>
                    <Gauge className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-2xl">{getFearGreedEmoji(fearGreedIndex.value)}</div>
                </div>
                <div className="mb-4">
                  <div className="relative w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full bg-gradient-to-r ${getFearGreedColor(fearGreedIndex.value)} rounded-full transition-all duration-500`}
                      style={{ width: `${Math.min(100, Math.max(0, fearGreedIndex.value))}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                      {fearGreedIndex.value}
                    </p>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
                      {getFearGreedLabel(fearGreedIndex.value)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* Dominance Table - Modern Design */}
      <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6 overflow-hidden mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {t('dominanceTable')}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('marketDominanceBreakdown')}
            </p>
          </div>
        </div>

        {dominanceTableData.length > 0 && (
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('cryptocurrency')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('marketCapPercentage')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('marketCap')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('volume24hDominance')}
                  </th>
                  <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('change24hDominance')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {dominanceTableData.filter(coin => coin.symbol === 'BTC' || coin.symbol === 'ETH').map((coin, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors duration-150"
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {coin.image ? (
                            <img
                              src={coin.image}
                              alt={coin.name}
                              className="h-10 w-10 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              onError={(e) => {
                                e.target.style.display = 'none'
                                e.target.nextSibling.style.display = 'flex'
                              }}
                            />
                          ) : null}
                          <div
                            className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${coin.image ? 'hidden' : 'flex'}`}
                            style={{ backgroundColor: dominanceData.filter(d => d.name !== t('others'))[index]?.color || '#6b7280' }}
                          >
                            {coin.symbol.charAt(0)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900 dark:text-white">
                            {coin.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {coin.symbol}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-gray-900 dark:text-white">
                        %{formatPercentage(coin.dominance)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatVolume(coin.marketCap)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {formatVolume(coin.volume)}
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className={`flex items-center gap-1 text-sm font-medium ${coin.change >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                        }`}>
                        {coin.change >= 0 ? (
                          <ArrowUpRight className="w-4 h-4" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4" />
                        )}
                        {coin.change >= 0 ? '+' : ''}{formatPercentage(coin.change)}%
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Charts Grid - Alt alta düzenlendi */}
      <div className="grid grid-cols-1 gap-6 mb-8">
        {/* Market Share Distribution */}
        <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {t('marketShareDistributionOverlay')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('last7Days')}
              </p>
            </div>
          </div>

          <div className="h-80 min-h-[320px] w-full" style={{ width: '100%', height: '320px' }}>
            {historicalData && historicalData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart
                  data={historicalData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
                >
                  <defs>
                    <linearGradient id="colorCoin1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f7931a" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f7931a" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="colorCoin2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#627eea" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#627eea" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#6b7280"
                    fontSize={12}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => value.split('-').slice(1).join('/')}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#6b7280"
                    fontSize={12}
                    domain={yDomainLeft}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#9ca3af"
                    fontSize={12}
                    domain={yDomainRight}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      backdropFilter: 'blur(10px)',
                      border: '1px solid rgba(229, 231, 235, 0.5)',
                      borderRadius: '12px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                    }}
                    labelStyle={{ color: '#111827', fontWeight: 600 }}
                    itemStyle={{ color: '#111827' }}
                    labelFormatter={(value) => `${t('date')}: ${value}`}
                    formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                  />
                  <Legend
                    formatter={(value) => value === (topCoins[0]?.symbol?.toUpperCase() || 'BTC') ? `${value} (L)` : `${value} (R)`}
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                  <Area
                    type="monotone"
                    yAxisId="left"
                    dataKey="coin1"
                    stroke="#f7931a"
                    fill="url(#colorCoin1)"
                    name={`${topCoins[0]?.symbol?.toUpperCase() || 'BTC'}`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Area
                    type="monotone"
                    yAxisId="right"
                    dataKey="coin2"
                    stroke="#627eea"
                    fill="url(#colorCoin2)"
                    name={`${topCoins[1]?.symbol?.toUpperCase() || 'ETH'}`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    fillOpacity={0.6}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 dark:text-gray-400">{t('dataLoading')}</div>
              </div>
            )}
          </div>
        </div>

        {/* Volume Analysis */}
        <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                {t('volumeAnalysis')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('topCryptocurrenciesByVolume')}
              </p>
            </div>
          </div>

          <div className="h-80 min-h-[320px] w-full" style={{ width: '100%', height: '320px' }}>
            {volumeData && volumeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={volumeData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.3} />
                  <XAxis
                    dataKey="name"
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tick={(props) => {
                      const { x, y, payload } = props
                      const coinData = volumeData.find(coin => coin.name === payload.value)
                      return (
                        <g transform={`translate(${x},${y})`}>
                          {coinData?.image ? (
                            <image
                              href={coinData.image}
                              x={-10}
                              y={-10}
                              width={20}
                              height={20}
                              clipPath="circle(10px at 10px 10px)"
                            />
                          ) : (
                            <text x={0} y={0} dy={16} textAnchor="middle" fill="#6b7280" fontSize={12}>
                              {payload.value}
                            </text>
                          )}
                        </g>
                      )
                    }}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickFormatter={(value) => formatVolume(value)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="volume"
                    fill="url(#volumeGradient)"
                    radius={[8, 8, 0, 0]}
                  />
                  <defs>
                    <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 dark:text-gray-400">{t('dataLoading')}</div>
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

export default Dominance

