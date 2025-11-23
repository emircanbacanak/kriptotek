import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useTheme } from '../contexts/ThemeContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import useCryptoData from '../hooks/useCryptoData'
import { loadUserFavorites, addFavorite, removeFavorite } from '../services/userFavorites'
import { updatePageSEO } from '../utils/seoMetaTags'
import { formatCurrency, formatLargeNumber, formatLargeCurrency } from '../utils/currencyConverter'
import MiniChart from '../components/MiniChart'
import { 
  TrendingUp, 
  TrendingDown, 
  Search, 
  RotateCcw,
  Activity,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  ChevronDown,
  ChevronUp,
  BarChart3
} from 'lucide-react'

const Home = () => {
  const { t, language } = useLanguage()
  const { isDark } = useTheme()
  const { currency } = useCurrency()
  const { user } = useAuth()
  
  useEffect(() => {
    updatePageSEO('home', language)
  }, [language])
  
  // Merkezi veri yönetim sisteminden veri al
  const { coins, topMovers, loading, isUpdating, refresh } = useCryptoData()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('market_cap')
  const [sortOrder, setSortOrder] = useState('desc')
  const [favorites, setFavorites] = useState(new Set())
  const [expandedRows, setExpandedRows] = useState(new Set())

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

  // Favori toggle fonksiyonu
  const handleToggleFavorite = useCallback(async (coinId) => {
    if (!user) return

    const isFavorite = favorites.has(coinId)
    const newFavorites = new Set(favorites)

    // Optimistic update
    if (isFavorite) {
      newFavorites.delete(coinId)
    } else {
      newFavorites.add(coinId)
    }
    setFavorites(newFavorites)

    // MongoDB'ye kaydet
    try {
      if (isFavorite) {
        await removeFavorite(user.uid, coinId)
      } else {
        await addFavorite(user.uid, coinId)
      }
    } catch (error) {
      // Hata durumunda geri al
      console.error('Error toggling favorite:', error)
      setFavorites(favorites)
    }
  }, [user, favorites])

  const filteredCoins = useMemo(() => {
    if (searchTerm.trim() && coins.length > 0) {
      const searchLower = searchTerm.toLowerCase().trim()
      
      return coins.filter(coin => {
        const nameLower = coin.name?.toLowerCase() || ''
        const symbolLower = coin.symbol?.toLowerCase() || ''
        return nameLower.includes(searchLower) || symbolLower.includes(searchLower)
      })
    }
    
    return coins
  }, [coins, searchTerm])

  const sortedCoins = useMemo(() => {
    if (!filteredCoins || !Array.isArray(filteredCoins)) return []
    
    return [...filteredCoins].sort((a, b) => {
      let aValue = a[sortBy]
      let bValue = b[sortBy]
      
      if (sortBy === 'market_cap') {
        aValue = a.market_cap || 0
        bValue = b.market_cap || 0
        return sortOrder === 'desc' ? bValue - aValue : aValue - bValue
      }
      
      if (sortBy === 'name' || sortBy === 'symbol') {
        aValue = aValue?.toLowerCase() || ''
        bValue = bValue?.toLowerCase() || ''
        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1
        } else {
          return aValue < bValue ? 1 : -1
        }
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })
  }, [filteredCoins, sortBy, sortOrder])

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const resetFilters = () => {
    setSearchTerm('')
    setSortBy('market_cap')
    setSortOrder('desc')
  }

  const handleRefresh = async () => {
    await refresh()
  }

  const sortOptions = [
    { key: 'market_cap', label: t('marketCap') },
    { key: 'total_volume', label: t('volume24h') },
    { key: 'price_change_percentage_24h', label: t('change24h') },
    { key: 'current_price', label: t('price') },
    { key: 'name', label: t('name') },
    { key: 'symbol', label: t('symbol') }
  ]

  const headerIconGradient = useMemo(() => isDark ? 'from-yellow-600 to-orange-600' : 'from-blue-500 to-indigo-500', [isDark])
  const headerTextGradient = useMemo(() => isDark ? 'from-yellow-400 to-orange-400' : 'from-blue-600 to-indigo-600', [isDark])

  // Loading timeout - 5 saniye sonra sayfayı göster (veri gelmese bile)
  const [showLoading, setShowLoading] = useState(true)
  useEffect(() => {
    if (!loading || coins.length > 0) {
      setShowLoading(false)
      return
    }
    const timeoutId = setTimeout(() => {
      setShowLoading(false)
    }, 5000) // 5 saniye sonra loading'i kapat
    return () => clearTimeout(timeoutId)
  }, [loading, coins.length])

  if (showLoading && loading && coins.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-gray-200 dark:border-gray-700 rounded-full"></div>
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-transparent border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary-500 dark:text-primary-400 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 lg:py-12">
        {/* Modern Header */}
        <div className="mb-4 sm:mb-6 md:mb-8 lg:mb-12">
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 mb-2 sm:mb-3 md:mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl md:rounded-2xl blur-xl opacity-50"></div>
              <div className={`relative bg-gradient-to-br ${headerIconGradient} w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg sm:rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg`}>
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-white" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <h1 className={`text-lg sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl font-bold bg-gradient-to-r ${headerTextGradient} bg-clip-text text-transparent truncate`}>
                  {t('cryptoList')}
                </h1>
                {isUpdating && (
                  <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <Activity className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
                    <span className="text-[10px] sm:text-xs md:text-sm font-medium text-blue-600 dark:text-blue-400">{t('updating')}</span>
                  </div>
                )}
              </div>
              <p className="text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 text-[11px] sm:text-xs md:text-sm lg:text-base">
                {t('cryptoListDescription')}
              </p>
            </div>
          </div>
        </div>

        {/* Top Gainers & Losers - Modern Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
          {/* Top Gainers */}
          <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 md:p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg sm:rounded-xl shadow-lg">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-gray-900 dark:text-white">
                    {t('topGainers')}
                  </h2>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-gray-400">
                    {t('todayTopMovers')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 sm:space-y-3">
              {(topMovers.topGainers.length > 0 ? topMovers.topGainers : []).map((coin, index) => (
                <div 
                  key={coin.id} 
                  className="group relative overflow-hidden bg-gradient-to-r from-green-50/50 to-emerald-50/50 dark:from-green-900/10 dark:to-emerald-900/10 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 lg:p-4 border border-green-200/50 dark:border-green-800/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.01] sm:hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-green-500 rounded-full blur opacity-50"></div>
                          <div className="relative w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] sm:text-xs md:text-sm shadow-lg">
                            #{index + 1}
                          </div>
                        </div>
                        <img 
                          src={coin.image}
                          alt={coin.name}
                          className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full object-cover ring-2 ring-green-200 dark:ring-green-800 flex-shrink-0"
                          onError={(e) => {
                            const attempts = parseInt(e.target.dataset.errorAttempts || '0')
                            if (attempts >= 2) {
                              e.target.style.display = 'none'
                              e.target.onerror = null
                              return
                            }
                            e.target.dataset.errorAttempts = (attempts + 1).toString()
                            const coinId = coin.id
                            if (attempts === 0) {
                              e.target.src = `https://assets.coingecko.com/coins/images/${coinId}/large/${coinId}.png`
                            } else {
                              e.target.style.display = 'none'
                              e.target.onerror = null
                            }
                          }}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          {coin.name.split(' ').length <= 3 ? (
                            <div className="text-[11px] sm:text-xs md:text-sm font-bold text-gray-900 dark:text-white truncate">
                              {coin.name}
                            </div>
                          ) : null}
                          <div className={`text-[9px] sm:text-[10px] md:text-xs ${coin.name.split(' ').length > 3 ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} truncate`}>
                            {coin.symbol?.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-[11px] sm:text-xs md:text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap mb-0.5 sm:mb-1">
                        {formatCurrency(coin.current_price)}
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs md:text-sm font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                        <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4" />
                        +{coin.price_change_percentage_24h?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {topMovers.topGainers.length === 0 && (
                <div className="text-center py-6 sm:py-8 text-gray-500 dark:text-gray-400 text-sm">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin"></div>
                      <span>{t('loading') || 'Yükleniyor...'}</span>
                    </div>
                  ) : (
                    t('noData')
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Top Losers */}
          <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-3 sm:p-4 md:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4 md:mb-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 md:p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg sm:rounded-xl shadow-lg">
                  <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-gray-900 dark:text-white">
                    {t('topLosers')}
                  </h2>
                  <p className="text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-gray-400">
                    {t('todayTopMovers')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-2 sm:space-y-3">
              {(topMovers.topLosers.length > 0 ? topMovers.topLosers : []).map((coin, index) => (
                <div 
                  key={coin.id} 
                  className="group relative overflow-hidden bg-gradient-to-r from-red-50/50 to-orange-50/50 dark:from-red-900/10 dark:to-orange-900/10 rounded-lg sm:rounded-xl p-2 sm:p-2.5 md:p-3 lg:p-4 border border-red-200/50 dark:border-red-800/50 hover:shadow-lg transition-all duration-300 hover:scale-[1.01] sm:hover:scale-[1.02]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-red-500 rounded-full blur opacity-50"></div>
                          <div className="relative w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 lg:w-10 lg:h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] sm:text-xs md:text-sm shadow-lg">
                            #{index + 1}
                          </div>
                        </div>
                        <img 
                          src={coin.image}
                          alt={coin.name}
                          className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-full object-cover ring-2 ring-red-200 dark:ring-red-800 flex-shrink-0"
                          onError={(e) => {
                            const attempts = parseInt(e.target.dataset.errorAttempts || '0')
                            if (attempts >= 2) {
                              e.target.style.display = 'none'
                              e.target.onerror = null
                              return
                            }
                            e.target.dataset.errorAttempts = (attempts + 1).toString()
                            const coinId = coin.id
                            if (attempts === 0) {
                              e.target.src = `https://assets.coingecko.com/coins/images/${coinId}/large/${coinId}.png`
                            } else {
                              e.target.style.display = 'none'
                              e.target.onerror = null
                            }
                          }}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        <div className="min-w-0">
                          {coin.name.split(' ').length <= 3 ? (
                            <div className="text-[11px] sm:text-xs md:text-sm font-bold text-gray-900 dark:text-white truncate">
                              {coin.name}
                            </div>
                          ) : null}
                          <div className={`text-[9px] sm:text-[10px] md:text-xs ${coin.name.split(' ').length > 3 ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} truncate`}>
                            {coin.symbol?.toUpperCase()}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <div className="text-[11px] sm:text-xs md:text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap mb-0.5 sm:mb-1">
                        {formatCurrency(coin.current_price, currency)}
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs md:text-sm font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                        <ArrowDownRight className="w-3 h-3 sm:w-4 sm:h-4" />
                        {coin.price_change_percentage_24h?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {topMovers.topLosers.length === 0 && (
                <div className="text-center py-6 sm:py-8 text-gray-500 dark:text-gray-400 text-sm">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-primary-500 dark:border-t-primary-400 rounded-full animate-spin"></div>
                      <span>{t('loading') || 'Yükleniyor...'}</span>
                    </div>
                  ) : (
                    t('noData')
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search and Filters - Modern Design */}
        <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8">
          <div className="space-y-3 sm:space-y-4 md:space-y-6">
            {/* Search Bar */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-lg sm:rounded-xl blur"></div>
              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
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

            {/* Sort Options and Reset */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 md:gap-4">
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {sortOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => handleSort(option.key)}
                    className={`px-2 sm:px-2.5 md:px-3 lg:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl font-medium text-[10px] sm:text-xs md:text-sm transition-all duration-200 ${
                      sortBy === option.key
                        ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg scale-105'
                        : 'bg-white/50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className="hidden sm:inline">{option.label}</span>
                    <span className="sm:hidden">{option.label.split(' ')[0]}</span>
                    {sortBy === option.key && (
                      <span className="ml-1 sm:ml-2">
                        {sortOrder === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg sm:rounded-xl font-medium text-[10px] sm:text-xs md:text-sm transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 sm:gap-2 w-full sm:w-auto"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>{t('reset')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Crypto List - Desktop Table / Mobile Cards */}
        <div className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-gray-200/50 dark:border-gray-800/50 overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-y-auto overflow-x-hidden max-h-[720px] crypto-list-scrollbar">
            <table className="w-full min-w-0 table-auto">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
                <tr>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider table-col-rank">#</th>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-left text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider crypto-name-column">{t('crypto')}</th>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider table-col-price">{t('priceAndChange')}</th>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell table-col-marketcap">
                    <span className="market-cap-full">{t('marketCap')}</span>
                    <span className="market-cap-short">Piyasa D.</span>
                  </th>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell table-col-supply">
                    <span className="supply-full">{t('circulatingSupply')}</span>
                    <span className="supply-short">Arz</span>
                  </th>
                  <th className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell table-col-volume">
                    <span className="volume-full">{t('volume24h')}</span>
                    <span className="volume-short">24S/Hacim</span>
                  </th>
                  <th className="px-1 sm:px-2 py-1.5 sm:py-2 md:py-3 text-center text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-8 sm:w-10 table-col-favorite">⭐</th>
                  <th className="px-1 sm:px-2 py-1.5 sm:py-2 md:py-3 text-center text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-8 sm:w-10 table-col-expand">▼</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedCoins.map((coin, index) => {
                  const isPositive = coin.price_change_percentage_24h >= 0
                  const isFavorite = favorites.has(coin.id)
                  const isExpanded = expandedRows.has(coin.id)
                  
                  return (
                    <React.Fragment key={coin.id}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-[10px] sm:text-xs md:text-sm text-gray-500 dark:text-gray-400 table-col-rank">
                          {coin.market_cap_rank || index + 1}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 crypto-name-column">
                          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
                            <img 
                              src={coin.image}
                              alt={coin.name}
                              className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full flex-shrink-0 object-cover"
                              onError={(e) => {
                                const attempts = parseInt(e.target.dataset.errorAttempts || '0')
                                if (attempts >= 2) {
                                  e.target.style.display = 'none'
                                  e.target.onerror = null
                                  return
                                }
                                e.target.dataset.errorAttempts = (attempts + 1).toString()
                                const coinId = coin.id
                                if (attempts === 0) {
                                  e.target.src = `https://assets.coingecko.com/coins/images/${coinId}/large/${coinId}.png`
                                } else {
                                  e.target.style.display = 'none'
                                  e.target.onerror = null
                                }
                              }}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                            <div className="min-w-0">
                              {coin.name.split(' ').length <= 2 ? (
                                <div className="text-xs md:text-sm font-semibold text-gray-900 dark:text-white truncate">{coin.name}</div>
                              ) : null}
                              <div className={`text-[10px] md:text-xs ${coin.name.split(' ').length > 2 ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} truncate`}>
                                {coin.symbol?.toUpperCase()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right table-col-price">
                          <div className="flex flex-col items-end gap-0.5 sm:gap-1">
                            <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                              {coin.current_price >= 1000 ? formatLargeCurrency(coin.current_price, currency) : formatCurrency(coin.current_price, currency)}
                            </div>
                            <div className={`text-[9px] sm:text-[10px] md:text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? '+' : ''}{coin.price_change_percentage_24h?.toFixed(2)}%
                            </div>
                          </div>
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs md:text-sm text-gray-900 dark:text-white whitespace-nowrap hidden md:table-cell table-col-marketcap">
                          {formatLargeCurrency(coin.market_cap, currency)}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs md:text-sm text-gray-900 dark:text-white whitespace-nowrap hidden lg:table-cell table-col-supply">
                          {formatLargeNumber(coin.circulating_supply)}
                        </td>
                        <td className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 md:py-3 text-right text-[10px] sm:text-xs md:text-sm text-gray-900 dark:text-white whitespace-nowrap hidden md:table-cell table-col-volume">
                          {formatLargeCurrency(coin.total_volume, currency)}
                        </td>
                        <td className="px-1 sm:px-2 py-1.5 sm:py-2 md:py-3 text-center table-col-favorite">
                          <button
                            onClick={() => handleToggleFavorite(coin.id)}
                            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title={isFavorite ? t('removeFavorite') : t('addFavorite')}
                          >
                            <Star 
                              className={`w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} 
                            />
                          </button>
                        </td>
                        <td className="px-1 sm:px-2 py-1.5 sm:py-2 md:py-3 text-center table-col-expand">
                          <button
                            onClick={() => {
                              if (isExpanded) {
                                // Grafik zaten açıksa kapat
                                const newExpanded = new Set(expandedRows)
                                newExpanded.delete(coin.id)
                                setExpandedRows(newExpanded)
                              } else {
                                // Yeni grafik açılırken diğer açık grafikleri kapat
                                setExpandedRows(new Set([coin.id]))
                              }
                            }}
                            className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ backgroundColor: '#1a1a1a' }}>
                          <td colSpan={8} className="px-4 py-4" style={{ backgroundColor: '#1a1a1a' }}>
                            <div className="w-full h-[300px]" style={{ backgroundColor: '#1a1a1a' }}>
                              <MiniChart 
                                coinId={coin.id} 
                                coinSymbol={coin.symbol} 
                                sparklineData={coin.sparkline_in_7d} 
                                isVisible={isExpanded} 
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden overflow-y-auto max-h-[720px] crypto-list-scrollbar">
            <div className="space-y-3">
              {sortedCoins.map((coin, index) => {
                const isPositive = coin.price_change_percentage_24h >= 0
                const isFavorite = favorites.has(coin.id)
                const isExpanded = expandedRows.has(coin.id)
                
                return (
                  <div 
                    key={coin.id} 
                    className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg sm:rounded-xl shadow-md border border-gray-200/50 dark:border-gray-700/50 p-3 sm:p-4 hover:shadow-lg transition-all duration-200 hover:scale-[1.01]"
                  >
                    {/* Main Card Content */}
                    <div className="space-y-3">
                      {/* First Row: Rank + Icon + Name + Price + Actions */}
                      <div className="flex items-center justify-between gap-3">
                        {/* Left: Rank + Icon + Name */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold w-5 sm:w-6 flex-shrink-0 text-center bg-gray-100 dark:bg-gray-700 rounded-md py-0.5">
                            {coin.market_cap_rank || index + 1}
                          </div>
                          <img 
                            src={coin.image}
                            alt={coin.name}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0 object-cover ring-2 ring-gray-200 dark:ring-gray-700"
                            onError={(e) => {
                              const attempts = parseInt(e.target.dataset.errorAttempts || '0')
                              if (attempts >= 2) {
                                e.target.style.display = 'none'
                                e.target.onerror = null
                                return
                              }
                              e.target.dataset.errorAttempts = (attempts + 1).toString()
                              const coinId = coin.id
                              if (attempts === 0) {
                                e.target.src = `https://assets.coingecko.com/coins/images/${coinId}/large/${coinId}.png`
                              } else {
                                e.target.style.display = 'none'
                                e.target.onerror = null
                              }
                            }}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1">
                            {coin.name.split(' ').length <= 3 ? (
                              <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">{coin.name}</div>
                            ) : null}
                            <div className={`text-[10px] sm:text-xs ${coin.name.split(' ').length > 3 ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} truncate`}>
                              {coin.symbol?.toUpperCase()}
                            </div>
                          </div>
                        </div>

                        {/* Right: Price + Change + Actions */}
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">
                              {coin.current_price >= 1000 ? formatLargeCurrency(coin.current_price, currency) : formatCurrency(coin.current_price, currency)}
                            </div>
                            <div className={`text-[10px] sm:text-xs font-semibold ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {isPositive ? '+' : ''}{coin.price_change_percentage_24h?.toFixed(2)}%
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <button
                              onClick={() => handleToggleFavorite(coin.id)}
                              className="p-1 sm:p-1.5 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors"
                              title={isFavorite ? t('removeFavorite') : t('addFavorite')}
                            >
                              <Star 
                                className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`} 
                              />
                            </button>
                            <button
                              onClick={() => {
                                if (isExpanded) {
                                  // Grafik zaten açıksa kapat
                                  const newExpanded = new Set(expandedRows)
                                  newExpanded.delete(coin.id)
                                  setExpandedRows(newExpanded)
                                } else {
                                  // Yeni grafik açılırken diğer açık grafikleri kapat
                                  setExpandedRows(new Set([coin.id]))
                                }
                              }}
                              className="p-1 sm:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 dark:text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Second Row: Market Cap + Volume + Circulating Supply */}
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1.5 sm:p-2">
                          <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1 font-medium">{t('marketCap')}</div>
                          <div className="text-[10px] sm:text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">{formatLargeCurrency(coin.market_cap, currency)}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1.5 sm:p-2">
                          <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1 font-medium">{t('volume24h')}</div>
                          <div className="text-[10px] sm:text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">{formatLargeCurrency(coin.total_volume, currency)}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1.5 sm:p-2">
                          <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 mb-0.5 sm:mb-1 font-medium">{t('circulatingSupply')}</div>
                          <div className="text-[10px] sm:text-xs font-bold text-gray-900 dark:text-white whitespace-nowrap">{formatLargeNumber(coin.circulating_supply)}</div>
                        </div>
                      </div>

                      {/* Expanded Details - Chart Only */}
                      {isExpanded && (
                        <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                          <div className="w-full h-[300px] rounded-lg overflow-hidden" style={{ backgroundColor: '#1a1a1a' }}>
                            <MiniChart 
                              coinId={coin.id} 
                              coinSymbol={coin.symbol} 
                              sparklineData={coin.sparkline_in_7d} 
                              isVisible={isExpanded} 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Currency Explanation Card */}
        <div className="mt-4 sm:mt-6 md:mt-8 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 backdrop-blur-xl rounded-lg sm:rounded-xl md:rounded-2xl shadow-lg border border-blue-200/50 dark:border-blue-800/50 p-3 sm:p-4 md:p-6">
          <h3 className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-blue-900 dark:text-blue-300 mb-2 sm:mb-3 md:mb-4 flex items-center gap-2">
            <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5" />
            {t('volumeMarketCapExplanation')}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">{t('thousand')}</div>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-tight">{t('thousandExplanation')}</p>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">{t('million')}</div>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-tight">{t('millionExplanation')}</p>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">{t('billion')}</div>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-tight">{t('billionExplanation')}</p>
            </div>
            <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg sm:rounded-xl p-2 sm:p-3 md:p-4 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-blue-700 dark:text-blue-400 mb-1">{t('trillion')}</div>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-600 dark:text-gray-400 leading-tight">{t('trillionExplanation')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
