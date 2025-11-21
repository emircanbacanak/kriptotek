import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { loadUserFavorites, addFavorite, removeFavorite } from '../services/userFavorites'
import useTrendingData from '../hooks/useTrendingData'
import { convertCurrency, formatCurrency, formatLargeNumber } from '../utils/currencyConverter'
import { Star, TrendingUp, TrendingDown, Search, Sparkles, Activity, ExternalLink } from 'lucide-react'
import { updatePageSEO } from '../utils/seoMetaTags'

const Trending = () => {
  const { t, language } = useLanguage()
  const { currency } = useCurrency()
  const { user } = useAuth()
  const { isDark } = useTheme()
  
  // Merkezi veri yönetim sisteminden trending verilerini al
  const { trendingCoins, loading, isUpdating } = useTrendingData()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('trend_score')
  const [sortOrder, setSortOrder] = useState('desc')
  const [favorites, setFavorites] = useState(new Set())
  const [selectedCoin, setSelectedCoin] = useState(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    updatePageSEO('trending', language)
  }, [language])

  // Favorileri yükle
  useEffect(() => {
    if (!user) {
      setFavorites(new Set())
      return
    }

    const loadFavorites = async () => {
      try {
        const result = await loadUserFavorites(user.uid)
        if (result.success) {
          setFavorites(new Set(result.favorites || []))
        }
      } catch (error) {
        console.error('Error loading favorites:', error)
      }
    }

    loadFavorites()
  }, [user])

  const handleToggleFavorite = async (coinId) => {
    if (!user) return
    
    const isFavorite = favorites.has(coinId)
    
    // Optimistic update
    setFavorites(prev => {
      const newSet = new Set(prev)
      if (isFavorite) {
        newSet.delete(coinId)
      } else {
        newSet.add(coinId)
      }
      return newSet
    })

    try {
      if (isFavorite) {
        await removeFavorite(user.uid, coinId)
      } else {
        await addFavorite(user.uid, coinId)
      }
    } catch (error) {
      console.error('Error toggling favorite:', error)
      // Revert optimistic update
      setFavorites(prev => {
        const newSet = new Set(prev)
        if (isFavorite) {
          newSet.add(coinId)
        } else {
          newSet.delete(coinId)
        }
        return newSet
      })
    }
  }

  // Trend level ve direction label'ları (dil uyumlu)
  const trendLevelLabels = useMemo(() => ({
    veryStrongTrend: t('veryStrongTrend'),
    strongTrend: t('strongTrend'),
    moderateTrend: t('moderateTrend'),
    weakTrend: t('weakTrend'),
    veryWeakTrend: t('veryWeakTrend')
  }), [t])

  const trendDirectionLabels = useMemo(() => ({
    strongBullish: t('strongBullish'),
    bullish: t('bullish'),
    neutral: t('neutral'),
    bearish: t('bearish'),
    strongBearish: t('strongBearish')
  }), [t])

  // Backend'den gelen string değerleri çevir
  const translateMetric = useCallback((value) => {
    if (!value || typeof value !== 'string') return value
    if (trendLevelLabels[value]) return trendLevelLabels[value]
    if (trendDirectionLabels[value]) return trendDirectionLabels[value]
    const translated = t(value)
    return typeof translated === 'string' ? translated : value
  }, [t, trendLevelLabels, trendDirectionLabels])

  // Helper functions for trend level and direction
  const getTrendLevel = useCallback((trendScore) => {
    if (trendScore >= 80) return { level: t('veryStrongTrend'), emoji: '🔥', color: 'green' }
    if (trendScore >= 70) return { level: t('strongTrend'), emoji: '📈', color: 'lime' }
    if (trendScore >= 45) return { level: t('moderateTrend'), emoji: '➡️', color: 'yellow' }
    if (trendScore >= 20) return { level: t('weakTrend'), emoji: '📊', color: 'orange' }
    return { level: t('veryWeakTrend'), emoji: '📉', color: 'red' }
  }, [t])

  const getAIDirection = useCallback((aiPrediction) => {
    if (aiPrediction > 3) return { direction: t('strongBullish'), emoji: '🚀', color: 'green', position: 'long' }
    if (aiPrediction > 1) return { direction: t('bullish'), emoji: '📈', color: 'lime', position: 'long' }
    if (aiPrediction < -3) return { direction: t('strongBearish'), emoji: '⚠️', color: 'red', position: 'short' }
    if (aiPrediction < -1) return { direction: t('bearish'), emoji: '📉', color: 'orange', position: 'short' }
    return { direction: t('neutral'), emoji: '➖', color: 'gray', position: 'neutral' }
  }, [t])

  const getPositionBadge = useCallback((positionType) => {
    if (positionType === 'long') return t('positionBadgeLong')
    if (positionType === 'short') return t('positionBadgeShort')
    return t('positionBadgeNeutral')
  }, [t])

  // Process coins - Backend'den gelen verileri doğrudan kullan, sadece eksik olanları hesapla
  const processedCoins = useMemo(() => {
    return (trendingCoins || []).map((coin) => {
      const trendScore = coin.trend_score || 0
      const aiPrediction = parseFloat(coin.ai_prediction || 0)
      
      // Backend'den gelen verileri kullan, yoksa frontend'de hesapla (fallback)
      const trendInfo = coin.trend_level ? {
        level: coin.trend_level,
        emoji: coin.trend_emoji || '📊',
        color: coin.trend_color || 'orange'
      } : getTrendLevel(trendScore)
      
      const aiInfo = coin.ai_direction ? {
        direction: coin.ai_direction,
        emoji: coin.ai_emoji || '➖',
        color: coin.ai_color || 'gray',
        position: coin.position_type || 'neutral'
      } : getAIDirection(aiPrediction)
      
      const predictedPrice = coin.predicted_price || (coin.current_price || coin.price) * (1 + (aiPrediction / 100))
      const predictionBasePrice = coin.prediction_base_price || coin.current_price || coin.price

      return {
        ...coin,
        price: coin.current_price || coin.price || 0,
        change_24h: coin.price_change_percentage_24h || coin.change_24h || 0,
        trend_score: trendScore,
        trend_level: trendInfo.level,
        trend_emoji: trendInfo.emoji,
        trend_color: trendInfo.color,
        ai_prediction: aiPrediction,
        ai_direction: aiInfo.direction,
        ai_emoji: aiInfo.emoji,
        ai_color: aiInfo.color,
        position_type: aiInfo.position,
        predicted_price: predictedPrice,
        prediction_base_price: predictionBasePrice,
        liquidity_score: coin.liquidity_score || 0,
        momentum_score: coin.momentum_score || 0,
        market_cap_score: coin.market_cap_score || 0,
        volume_trend_score: coin.volume_trend_score || 0,
        volatility_score: coin.volatility_score || 0,
      }
    })
  }, [trendingCoins, getTrendLevel, getAIDirection])

  // Filtreleme ve sıralama
  const filteredAndSortedCoins = useMemo(() => {
    let filtered = processedCoins

    // Arama filtresi
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(coin => 
        coin.name?.toLowerCase().includes(term) ||
        coin.symbol?.toLowerCase().includes(term)
      )
    }

    // Sıralama
    filtered = [...filtered].sort((a, b) => {
      let aValue, bValue

      switch (sortBy) {
        case 'trend_score':
          aValue = a.trend_score || 0
          bValue = b.trend_score || 0
          break
        case 'ai_prediction':
          aValue = parseFloat(a.ai_prediction || 0)
          bValue = parseFloat(b.ai_prediction || 0)
          break
        case 'price_change_24h':
          aValue = a.change_24h || 0
          bValue = b.change_24h || 0
          break
        case 'market_cap':
          aValue = a.market_cap || 0
          bValue = b.market_cap || 0
          break
        case 'volume_24h':
          aValue = a.total_volume || a.volume_24h || 0
          bValue = b.total_volume || b.volume_24h || 0
          break
        default:
          aValue = a.trend_score || 0
          bValue = b.trend_score || 0
      }

      if (sortOrder === 'asc') {
        return aValue - bValue
      }
      return bValue - aValue
    })

    return filtered
  }, [processedCoins, searchTerm, sortBy, sortOrder])

  const formatPrice = useCallback((price) => {
    const convertedPrice = convertCurrency(price, 'USD', currency)
    return formatCurrency(convertedPrice, currency)
  }, [currency])

  const formatBigNumber = useCallback((num) => {
    const convertedNum = convertCurrency(num, 'USD', currency)
    return formatLargeNumber(convertedNum, currency)
  }, [currency])

  // Tahmini fiyatı baz fiyatın ondalık basamak sayısına göre formatla
  const formatEstimatedPrice = useCallback((predictedPrice, basePrice) => {
    if (!predictedPrice || !basePrice) {
      return formatPrice(predictedPrice || 0)
    }

    // Baz fiyatın formatlanmış halini al (currency conversion dahil)
    const formattedBasePrice = formatPrice(basePrice)
    
    // Formatlanmış string'den ondalık basamak sayısını bul
    // Önce currency symbol'leri ve boşlukları temizle
    const cleanBasePrice = formattedBasePrice
      .replace(/[$€£₺₿]/g, '')
      .replace(/\s+/g, '')
      .replace(/,/g, '') // Binlik ayırıcıları da temizle
      .trim()
    
    const decimalIndex = cleanBasePrice.indexOf('.')
    let decimalPlaces = 0
    
    if (decimalIndex !== -1) {
      // Ondalık kısmı al (tüm basamakları say, sondaki sıfırlar dahil)
      const decimalPart = cleanBasePrice.substring(decimalIndex + 1)
      decimalPlaces = decimalPart.length
    }

    // Eğer ondalık basamak yoksa, en az 2 basamak göster
    if (decimalPlaces === 0) {
      decimalPlaces = 2
    }

    // Tahmini fiyatı aynı sayıda ondalık basamakla formatla
    const convertedPrice = convertCurrency(predictedPrice, 'USD', currency)
    const formatted = convertedPrice.toFixed(decimalPlaces)
    
    // Currency symbol ekle (formatPrice ile aynı formatı kullan)
    if (currency === 'USD') {
      return `$${formatted}`
    } else if (currency === 'EUR') {
      return `€${formatted}`
    } else if (currency === 'GBP') {
      return `£${formatted}`
    } else if (currency === 'TRY') {
      return `${formatted} ₺`
    } else if (currency === 'BTC') {
      return `₿${formatted}`
    }
    return `${formatted} ${currency}`
  }, [currency, formatPrice])

  const showCoinDetails = (coin) => {
    setSelectedCoin(coin)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setSelectedCoin(null)
  }

  const headerIconGradient = useMemo(() => isDark ? 'from-yellow-600 to-orange-600' : 'from-blue-500 to-indigo-500', [isDark])
  const headerTextGradient = useMemo(() => isDark ? 'from-yellow-400 to-orange-400' : 'from-blue-600 to-indigo-600', [isDark])
  const emptyStateGradient = useMemo(() => isDark ? 'from-blue-500 via-indigo-600 to-purple-500' : 'from-cyan-500 via-blue-500 to-indigo-500', [isDark])
  const aiPredictionGradient = 'from-cyan-500 via-blue-500 to-indigo-500'

  if (loading && trendingCoins.length === 0) {
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

  if (!loading && filteredAndSortedCoins.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/20 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 animate-fade-in">
          <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-xl flex items-center justify-center shadow-lg`}>
            <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
              {t('trendingTitle')}
            </h1>
          </div>
        </div>
        
        <div className="relative overflow-hidden rounded-2xl shadow-2xl animate-fade-in">
          <div className={`absolute inset-0 bg-gradient-to-br ${emptyStateGradient}`}></div>
          <div className="relative z-10 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/20 backdrop-blur-lg border border-white/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t('noTrendingCoins')}</h3>
            <p className="text-blue-100 mb-4 text-sm sm:text-base max-w-md mx-auto">{t('trendingDescription')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/20 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 md:gap-0 mb-4 sm:mb-6 md:mb-8 animate-fade-in">
        <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110`}>
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 lg:w-7 lg:h-7 text-white" />
          </div>
          <div className="flex-1">
            <h1 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
              {t('trendingTitle')}
            </h1>
            {/* Sistem güncelleme bilgisi - başlığın altında aynı hizada */}
            <p className="text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400 mt-1 animate-pulse">
              Sistem 30 dk da bir güncellenmektedir ⚡
            </p>
          </div>
        </div>
        {isUpdating && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs md:text-sm text-gray-600 dark:text-gray-400">
            <Activity className="w-3 h-3 sm:w-4 sm:h-4 animate-pulse" />
            <span>{t('updating')}</span>
          </div>
        )}
      </div>

      {/* Search and Filter */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchCryptos')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 md:py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[12px] sm:text-sm md:text-base text-gray-900 dark:text-white"
          />
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-[11px] sm:text-xs md:text-sm text-gray-900 dark:text-white"
          >
            <option value="trend_score">{t('trendScore')}</option>
            <option value="ai_prediction">{t('aiPrediction')}</option>
            <option value="price_change_24h">{t('priceChange24h')}</option>
            <option value="market_cap">{t('marketCap')}</option>
            <option value="volume_24h">{t('volume24h')}</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-[11px] sm:text-xs md:text-sm"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Trending Coins Grid */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 lg:gap-6 max-h-[600px] sm:max-h-[700px] lg:max-h-[800px] overflow-y-auto overflow-x-hidden pr-2 crypto-list-scrollbar">
          {filteredAndSortedCoins.map((coin, index) => (
            <div key={coin.id || index} className="group/card relative animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover/card:opacity-100 blur-xl transition-opacity duration-300"></div>
              <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl lg:rounded-2xl p-2 sm:p-3 md:p-4 lg:p-5 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 flex flex-col">
                <div className="flex items-center justify-between mb-1.5 sm:mb-2 md:mb-3 lg:mb-4">
                  {/* Left Side: Icon and Symbol */}
                  <div className="flex items-center space-x-1 sm:space-x-1.5 md:space-x-2 lg:space-x-3 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <img
                        className="h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 lg:h-10 lg:w-10 rounded-full"
                        src={coin.image}
                        alt={coin.name}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.target.style.display = 'none'
                        }}
                      />
                      <div className="absolute -top-0.5 -right-0.5 w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[7px] sm:text-[8px] md:text-[9px] lg:text-xs font-bold">#{index + 1}</span>
                      </div>
                    </div>
                    <h3 className="font-semibold text-[10px] sm:text-xs md:text-sm lg:text-base text-gray-900 dark:text-white truncate">
                      {coin.symbol?.toUpperCase() || coin.symbol}
                    </h3>
                  </div>

                  {/* Middle: Price & Change Group */}
                  <div className="text-right mx-0.5 sm:mx-1 md:mx-1.5 lg:mx-2 flex-shrink-0">
                    <div className="text-[10px] sm:text-xs md:text-sm lg:text-lg font-bold text-gray-900 dark:text-white">
                      {formatPrice(coin.price)}
                    </div>
                    <div className={`flex items-center justify-end text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium ${
                      coin.change_24h >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}>
                      {coin.change_24h >= 0 ? <TrendingUp className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 lg:w-4 lg:h-4" /> : <TrendingDown className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 lg:w-4 lg:h-4" />}
                      <span className="ml-0.5 sm:ml-1">{coin.change_24h.toFixed(2)}%</span>
                    </div>
                  </div>

                  {/* Right Side: Favorite Button */}
                  <button
                    onClick={() => handleToggleFavorite(coin.id)}
                    className={`transition-colors p-0.5 sm:p-1 rounded-full flex-shrink-0 ${
                      favorites.has(coin.id)
                        ? 'text-yellow-500 hover:text-yellow-600'
                        : 'text-gray-400 hover:text-yellow-500'
                    }`}
                    title={favorites.has(coin.id) ? t('removeFavorite') : t('addFavorite')}
                  >
                    <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 ${favorites.has(coin.id) ? 'fill-current' : ''}`} />
                  </button>
                </div>

                <div className="flex-grow space-y-1.5 sm:space-y-3 lg:space-y-4 flex flex-col justify-between">
                  <div>
                    {/* Trend Score */}
                    <div className="mb-1.5 sm:mb-3 lg:mb-4">
                      <div className="flex justify-between items-center text-[10px] sm:text-xs lg:text-sm mb-0.5 sm:mb-1.5 lg:mb-2">
                        <span className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400">{t('trendScore')}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm sm:text-base">{coin.trend_emoji}</span>
                          <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                            {coin.trend_score}/100
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            coin.trend_color === 'green' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                            coin.trend_color === 'lime' ? 'bg-gradient-to-r from-lime-500 to-lime-600' :
                            coin.trend_color === 'yellow' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                            coin.trend_color === 'orange' ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                            'bg-gradient-to-r from-red-500 to-red-600'
                          }`}
                          style={{ width: `${coin.trend_score}%` }}
                        ></div>
                      </div>
                    <div className="mt-1.5 text-center">
                      <span className={`text-[9px] sm:text-xs font-semibold px-2 py-0.5 rounded-full ${
                        coin.trend_color === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        coin.trend_color === 'lime' ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' :
                        coin.trend_color === 'yellow' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        coin.trend_color === 'orange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {translateMetric(coin.trend_level)}
                      </span>
                    </div>
                    </div>

                    {/* AI Prediction Box */}
                    <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-base sm:text-lg">🤖</span>
                          <span className="text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300">
                            {getPositionBadge(coin.position_type)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span className="text-lg sm:text-xl">{coin.ai_emoji}</span>
                          <span className={`text-xs sm:text-sm font-bold ${
                            coin.ai_color === 'green' ? 'text-green-600 dark:text-green-400' :
                            coin.ai_color === 'lime' ? 'text-lime-600 dark:text-lime-400' :
                            coin.ai_color === 'red' ? 'text-red-600 dark:text-red-400' :
                            coin.ai_color === 'orange' ? 'text-orange-600 dark:text-orange-400' :
                            'text-gray-600 dark:text-gray-400'
                          }`}>
                            {coin.ai_prediction >= 0 ? '+' : ''}{coin.ai_prediction.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400">{t('predictionBasePrice')}:</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                            {formatPrice(coin.prediction_base_price)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs sm:text-sm">
                          <span className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400">{t('estimatedPrice')}:</span>
                          <span className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                            {formatEstimatedPrice(coin.predicted_price, coin.prediction_base_price)}
                          </span>
                        </div>
                      </div>
                    <div className="mt-2 text-center">
                      <span className={`text-[9px] sm:text-xs font-semibold px-2 py-0.5 rounded-full ${
                        coin.ai_color === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        coin.ai_color === 'lime' ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' :
                        coin.ai_color === 'red' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        coin.ai_color === 'orange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}>
                        {translateMetric(coin.ai_direction)}
                      </span>
                    </div>
                    </div>
                  </div>

                  <button
                    onClick={() => showCoinDetails(coin)}
                    className="w-full px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mt-auto"
                  >
                    <span>{t('viewDetails')}</span>
                    <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal */}
      {showModal && selectedCoin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" onClick={closeModal}>
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md sm:max-w-lg lg:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4 lg:p-6 flex items-center justify-between z-10">
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                <img 
                  src={selectedCoin.image} 
                  alt={selectedCoin.name} 
                  className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white truncate">{selectedCoin.name}</h2>
                  <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">{selectedCoin.symbol?.toUpperCase()}</p>
                </div>
              </div>
              <button 
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 rounded-lg">
                  <p className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">{t('price')}</p>
                  <p className="text-xs sm:text-sm lg:text-base font-bold text-gray-900 dark:text-white truncate">{formatPrice(selectedCoin.price)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 rounded-lg">
                  <p className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">{t('change24h')}</p>
                  <p className={`text-xs sm:text-sm lg:text-base font-bold ${
                    selectedCoin.change_24h >= 0 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {selectedCoin.change_24h >= 0 ? '+' : ''}{selectedCoin.change_24h.toFixed(2)}%
                  </p>
                </div>
              </div>

              {/* AI Prediction Section */}
              <div className={isDark ? "bg-gradient-to-br from-purple-500 to-blue-500 p-2.5 sm:p-3 rounded-lg text-white text-xs sm:text-sm" : "relative overflow-hidden rounded-xl shadow-lg animate-fade-in"}>
                {!isDark && (
                  <>
                    <div className={`absolute inset-0 bg-gradient-to-br ${aiPredictionGradient}`}></div>
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
                  </>
                )}
                <div className={`relative p-2.5 sm:p-3 ${isDark ? '' : 'text-white'} text-xs sm:text-sm`}>
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className="text-base sm:text-lg flex-shrink-0">🤖</span>
                      <div className="min-w-0">
                        <span className={`text-xs sm:text-sm font-bold block truncate ${isDark ? 'text-white' : 'text-white'}`}>
                          {getPositionBadge(selectedCoin.position_type)}
                        </span>
                        <p className={`text-[8px] sm:text-xs opacity-80 mt-0.5 ${isDark ? 'text-white' : 'text-white'}`}>{t('algorithmicPricePrediction')}</p>
                      </div>
                    </div>
                    <span className="text-base sm:text-lg flex-shrink-0">{selectedCoin.ai_emoji}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mb-2">
                    <div className={`bg-white/10 backdrop-blur-sm p-1.5 sm:p-2 rounded ${isDark ? '' : ''}`}>
                      <div className={`text-[8px] sm:text-xs opacity-80 mb-0.5 ${isDark ? 'text-white' : 'text-white'}`}>{t('estimatedChange')}</div>
                      <div className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-white'}`}>
                        {selectedCoin.ai_prediction >= 0 ? '+' : ''}{selectedCoin.ai_prediction.toFixed(2)}%
                      </div>
                    </div>
                    <div className={`bg-white/10 backdrop-blur-sm p-1.5 sm:p-2 rounded ${isDark ? '' : ''}`}>
                      <div className={`text-[8px] sm:text-xs opacity-80 mb-0.5 ${isDark ? 'text-white' : 'text-white'}`}>{t('estimatedPrice')}</div>
                      <div className={`text-xs sm:text-sm font-bold truncate ${isDark ? 'text-white' : 'text-white'}`}>
                        {formatEstimatedPrice(selectedCoin.predicted_price, selectedCoin.prediction_base_price)}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-white/10 backdrop-blur-sm p-1.5 sm:p-2 rounded mb-1 sm:mb-1.5">
                    <span className={`text-[8px] sm:text-xs ${isDark ? 'text-white/80' : 'text-white/80'}`}>{t('direction')}:</span>
                    <span className={`text-xs sm:text-sm font-bold ${isDark ? 'text-white' : 'text-white'}`}>{translateMetric(selectedCoin.ai_direction)}</span>
                  </div>
                </div>
              </div>

              {/* Trend Score Section */}
              <div className="bg-white dark:bg-gray-800 p-2.5 sm:p-3 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                <div className="flex justify-between items-start sm:items-center mb-2">
                  <div>
                    <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 block">{t('totalTrendScore')}</span>
                    <p className="text-[8px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('totalTrendScoreDesc')}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-base sm:text-lg lg:text-xl font-bold text-blue-600 dark:text-blue-400">{selectedCoin.trend_score}</span>
                    <span className="text-[9px] sm:text-xs text-gray-500">/100</span>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 sm:h-3">
                  <div 
                    className={`h-2 sm:h-3 rounded-full transition-all ${
                      selectedCoin.trend_color === 'green' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                      selectedCoin.trend_color === 'lime' ? 'bg-gradient-to-r from-lime-500 to-lime-600' :
                      selectedCoin.trend_color === 'yellow' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                      selectedCoin.trend_color === 'orange' ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                      'bg-gradient-to-r from-red-500 to-red-600'
                    }`}
                    style={{ width: `${selectedCoin.trend_score}%` }}
                  ></div>
                </div>
                <div className="mt-2 text-center">
                  <span className={`inline-block text-sm font-bold px-3 py-1 rounded-full ${
                    selectedCoin.trend_color === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    selectedCoin.trend_color === 'lime' ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' :
                    selectedCoin.trend_color === 'yellow' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    selectedCoin.trend_color === 'orange' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {translateMetric(selectedCoin.trend_level)}
                  </span>
                </div>
              </div>

              {/* Detailed Metrics */}
              <div className="bg-white dark:bg-gray-800 p-3 sm:p-4 rounded-lg space-y-3">
                <h4 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <span>📊</span>
                  <span>{t('detailedAnalysisMetrics')}</span>
                </h4>
                
                <div className="space-y-2.5">
                  {[
                    { label: t('liquidityScore'), value: selectedCoin.liquidity_score, color: 'blue', icon: '💧', desc: t('volumeMarketCapRatio') },
                    { label: t('priceMomentum'), value: selectedCoin.momentum_score, color: 'green', icon: '🚀', desc: t('priceChange24h') },
                    { label: t('marketPosition'), value: selectedCoin.market_cap_score, color: 'purple', icon: '🏆', desc: t('marketCapRankDesc') },
                    { label: t('volumeTrend'), value: selectedCoin.volume_trend_score, color: 'orange', icon: '📊', desc: t('tradingVolumeActivity') },
                    { label: t('volatilityScore'), value: selectedCoin.volatility_score, color: 'red', icon: '⚡', desc: t('priceVolatility') },
                  ].map((metric, idx) => (
                    <div key={idx} className={`bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 rounded border-l-4 border-${metric.color}-500`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <div>
                          <p className="text-[9px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300">{metric.icon} {metric.label}</p>
                          <p className="text-[8px] sm:text-xs text-gray-500 dark:text-gray-400">{metric.desc}</p>
                        </div>
                        <span className={`text-xs sm:text-sm font-bold text-${metric.color}-600 dark:text-${metric.color}-400`}>{metric.value}/100</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 sm:h-2">
                        <div className={`bg-${metric.color}-500 h-1.5 sm:h-2 rounded-full`} style={{ width: `${metric.value}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 rounded-lg">
                  <p className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">{t('marketCap')}</p>
                  <p className="text-xs sm:text-sm lg:text-base font-bold text-gray-900 dark:text-white truncate">{formatBigNumber(selectedCoin.market_cap)}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-2 sm:p-3 rounded-lg">
                  <p className="text-[9px] sm:text-xs text-gray-600 dark:text-gray-400 mb-1 font-semibold">{t('volume24h')}</p>
                  <p className="text-xs sm:text-sm lg:text-base font-bold text-gray-900 dark:text-white truncate">{formatBigNumber(selectedCoin.total_volume || selectedCoin.volume_24h)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Trending
