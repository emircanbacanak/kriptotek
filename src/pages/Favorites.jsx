import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { loadUserFavorites, subscribeToFavorites, removeFavorite, clearAllFavorites } from '../services/userFavorites'
import useCryptoData from '../hooks/useCryptoData'
import { convertCurrency, formatCurrency, formatLargeNumber, formatLargeCurrency } from '../utils/currencyConverter'
import { Star, TrendingUp, TrendingDown, Trash2 } from 'lucide-react'
import { updatePageSEO } from '../utils/seoMetaTags'

// AI Prediction hesaplama (sayfa içinde)
const calculateCryptoMetrics = (coin, index, t) => {
  if (!coin || coin.ai_prediction) return coin

  const volumeRatio = coin.total_volume && coin.market_cap ? coin.total_volume / coin.market_cap : 0
  const priceChange = coin.price_change_percentage_24h || 0
  const rank = coin.market_cap_rank || index + 1
  
  const momentumFactor = priceChange * 0.6
  let reversionFactor = 0
  if (priceChange > 10) reversionFactor = -2
  else if (priceChange < -10) reversionFactor = 3
  const liquidityImpact = (volumeRatio > 0.15) ? 1 : -0.5
  const stabilityFactor = (rank <= 10) ? 0.5 : 0
  const aiPrediction = momentumFactor + reversionFactor + liquidityImpact + stabilityFactor

  const estimatedPrice = coin.current_price * (1 + (aiPrediction / 100))

  return {
    ...coin,
    ai_prediction: aiPrediction.toFixed(2),
    estimated_price: estimatedPrice
  }
}

const Favorites = () => {
  const { t, language } = useLanguage()
  const { currency } = useCurrency()
  const { user } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  
  // Merkezi veri yönetim sisteminden crypto verilerini al
  const { coins } = useCryptoData()
  
  const [favoriteCoins, setFavoriteCoins] = useState([])
  const [favoriteIds, setFavoriteIds] = useState([])
  const [loading, setLoading] = useState(false) // Başlangıçta false, user yüklendiğinde true yapılacak
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    updatePageSEO('favorites', language)
  }, [language])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Favori ID'lerine göre coin'leri filtrele ve işle
  const processFavoriteCoins = useCallback((favoritesIds, allCoins) => {
    if (!isMountedRef.current) return
    
    // Favoriler boşsa veya coin'ler yoksa
    if (!favoritesIds || favoritesIds.length === 0) {
      setFavoriteCoins([])
      setLoading(false)
      return
    }
    
    // Coin'ler henüz yüklenmemişse
    if (!allCoins || allCoins.length === 0) {
      setFavoriteCoins([])
      setLoading(false)
      return
    }

    // Favorileri filtrele ve işle
    const favorites = allCoins
      .filter(coin => favoritesIds.includes(coin.id))
      .map((coin, index) => calculateCryptoMetrics(coin, index, t))
    
    setFavoriteCoins(favorites)
    setLoading(false)
  }, [t])

  // Favorileri yükle ve dinle
  useEffect(() => {
    if (!user) {
      setFavoriteCoins([])
      setFavoriteIds([])
      setLoading(false)
      return
    }

    let unsubscribe = null
    let isActive = true

    const initializeFavorites = async () => {
      try {
        setLoading(true)
        
        // İlk yükleme
        const favoritesResult = await loadUserFavorites(user.uid)
        if (!isMountedRef.current) return
        
        if (favoritesResult.success) {
          const favoritesIds = favoritesResult.favorites || []
          setFavoriteIds(favoritesIds)
          
          // Mevcut coin'lerle işle
          if (coins && coins.length > 0) {
            processFavoriteCoins(favoritesIds, coins)
          } else {
            // Coin'ler henüz yüklenmemişse, favoriler boş olsa bile loading'i false yap
            setFavoriteCoins([])
            setLoading(false)
          }
        } else {
          // Favoriler yüklenemedi veya boş
          setFavoriteIds([])
          setFavoriteCoins([])
          setLoading(false)
        }

        // Real-time dinleme (polling) - varsayılan 30 saniye
        unsubscribe = subscribeToFavorites(user.uid, (result) => {
          if (!isActive) return

          if (result.success) {
            const newFavorites = result.favorites || []
            
            // State'i güncelle
            setFavoriteIds(prevIds => {
              // Sadece değişiklik varsa güncelle
              if (JSON.stringify(newFavorites) !== JSON.stringify(prevIds)) {
                // Mevcut coin'lerle işle
                if (coins && coins.length > 0) {
                  processFavoriteCoins(newFavorites, coins)
                } else {
                  // Coin'ler henüz yüklenmemişse, sadece state'i güncelle
                  if (isMountedRef.current) {
                    setFavoriteCoins([])
                  }
                }
                return newFavorites
              }
              return prevIds
            })
          }
        })
      } catch (error) {
        console.error('Error initializing favorites:', error)
        if (isMountedRef.current) {
          setFavoriteCoins([])
          setFavoriteIds([])
          setLoading(false)
        }
      }
    }

    initializeFavorites()

    return () => {
      isActive = false
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user, coins, processFavoriteCoins])

  // Coin'ler güncellendiğinde favorileri yeniden işle
  useEffect(() => {
    if (favoriteIds.length > 0 && coins && coins.length > 0) {
      processFavoriteCoins(favoriteIds, coins)
    } else if (favoriteIds.length === 0) {
      // Favoriler boşsa, coin'ler yüklendiğinde veya yüklenmediğinde de loading'i false yap
      if (isMountedRef.current) {
        setFavoriteCoins([])
        setLoading(false)
      }
    }
  }, [coins, favoriteIds, processFavoriteCoins])

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleRemoveFavorite = async (coinId) => {
    if (!user) return
    try {
      const result = await removeFavorite(user.uid, coinId)
      if (result.success) {
        setFavoriteIds(result.favorites || [])
        // processFavoriteCoins otomatik çağrılacak (useEffect)
      }
    } catch (error) {
      console.error('Error removing favorite:', error)
    }
  }

  const handleClearAll = () => {
    setShowClearConfirm(true)
  }

  const confirmClearAll = async () => {
    if (!user) return
    try {
      const result = await clearAllFavorites(user.uid)
      if (result.success) {
        setFavoriteIds([])
        setShowClearConfirm(false)
      }
    } catch (error) {
      console.error('Error clearing favorites:', error)
      setShowClearConfirm(false)
    }
  }

  const cancelClearAll = () => {
    setShowClearConfirm(false)
  }
  
  const formatPrice = useCallback((price) => {
    if (!price || isNaN(price)) return 'N/A'
    const convertedPrice = convertCurrency(price, 'USD', currency)
    // Home.jsx'teki gibi: 1000'den büyükse formatLargeCurrency, değilse formatCurrency kullan
    if (convertedPrice >= 1000) {
      return formatLargeCurrency(convertedPrice, currency)
    }
    return formatCurrency(convertedPrice, currency)
  }, [currency])

  const formatBigNumber = useCallback((num) => {
    if (!num || isNaN(num)) return 'N/A'
    const convertedNum = convertCurrency(num, 'USD', currency)
    return formatLargeCurrency(convertedNum, currency)
  }, [currency])

  // Get gradient classes based on theme
  const emptyStateGradient = useMemo(() => {
    return isDark 
      ? 'from-blue-500 via-indigo-600 to-purple-500'
      : 'from-cyan-500 via-blue-500 to-indigo-500'
  }, [isDark])

  const clearButtonGradient = useMemo(() => {
    if (isDark) return 'from-yellow-600 to-orange-600'
    return 'from-blue-600 to-indigo-600'
  }, [isDark])

  const headerIconGradient = useMemo(() => {
    if (isDark) return 'from-yellow-600 to-orange-600'
    return 'from-blue-500 to-indigo-500'
  }, [isDark])

  const headerTextGradient = useMemo(() => {
    if (isDark) return 'from-yellow-400 to-orange-400'
    return 'from-blue-600 to-indigo-600'
  }, [isDark])

  // Loading durumunda spinner göster (sadece ilk yükleme sırasında)
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full"></div>
          <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8 animate-fade-in">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0 w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  {t('clearAllFavorites')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {t('clearAllFavoritesConfirmation')}
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={cancelClearAll}
                className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmClearAll}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
              >
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-6 sm:mb-8 animate-fade-in">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110`}>
              <Star className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
                {t('favoritesTitle')}
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-gray-600 dark:text-gray-300 mt-1 sm:mt-2 hidden sm:block">
                {t('favoritesDescription')}
              </p>
            </div>
          </div>
          {favoriteCoins.length > 0 && (
            <button 
              onClick={handleClearAll} 
              className={`group relative overflow-hidden bg-gradient-to-r ${clearButtonGradient} text-white rounded-lg sm:rounded-xl px-3 py-2 sm:px-5 sm:py-3 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap font-medium text-xs sm:text-sm lg:text-base w-full sm:w-auto justify-center`}
            >
              <Trash2 className="w-3 h-3 sm:w-5 sm:h-5" />
              <span>{t('clearAllFavorites')}</span>
            </button>
          )}
        </div>

        {favoriteCoins.length === 0 ? (
          <div className="relative overflow-hidden rounded-2xl shadow-2xl animate-fade-in">
            <div className={`absolute inset-0 bg-gradient-to-br ${emptyStateGradient}`}></div>
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
            <div className="relative z-10 p-8 sm:p-12 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-white/20 backdrop-blur-lg border border-white/30 rounded-full mb-4">
                  <Star className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t('noFavorites')}</h2>
              <p className="text-blue-100 mb-8 text-sm sm:text-base max-w-md mx-auto">{t('noFavoritesDesc')}</p>
              <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 font-semibold rounded-xl transition-all duration-300 hover:scale-110 hover:shadow-2xl">
                {t('goToHome')}
              </button>
            </div>
          </div>
        ) : (
          <div className="lg:border lg:border-gray-200 lg:dark:border-gray-700 lg:rounded-lg lg:overflow-hidden">
            {isDesktop && (
              <div className="bg-gray-50 dark:bg-gray-800 px-3 py-3">
                <div className="flex items-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <div className="w-12 text-center table-col-rank">#</div>
                  <div className="flex-1 min-w-0 crypto-name-column">{t('crypto')}</div>
                  <div className="w-36 text-right table-col-price">{t('priceAndChange')}</div>
                  <div className="w-28 text-right table-col-ai">{t('aiPrediction')}</div>
                  <div className="w-28 text-right table-col-marketcap">
                    <span className="market-cap-full">{t('marketCap')}</span>
                    <span className="market-cap-short">{t('marketCapShort')}</span>
                  </div>
                  <div className="w-28 text-right table-col-supply">
                    <span className="supply-full">{t('circulatingSupply')}</span>
                    <span className="supply-short">{t('circulatingSupplyShort')}</span>
                  </div>
                  <div className="w-28 text-right table-col-volume">
                    <span className="volume-full">{t('volume24h')}</span>
                    <span className="volume-short">{t('volume24hShort')}</span>
                  </div>
                  <div className="w-16 text-center table-col-delete"><Trash2 className="w-4 h-4 mx-auto" /></div>
                </div>
              </div>
            )}

            <div className="space-y-3 lg:space-y-0 lg:divide-y lg:divide-gray-200 lg:dark:divide-gray-700">
              {favoriteCoins.map((coin) => (
                isDesktop ? (
                  <div key={coin.id} className="flex items-center px-3 py-4 hover:bg-gray-50 dark:hover:bg-gray-800">
                    <div className="w-12 text-sm text-gray-900 dark:text-white text-center table-col-rank">{coin.market_cap_rank}</div>
                    <div className="flex items-center flex-1 min-w-0 crypto-name-column">
                      <img className="h-8 w-8 rounded-full" src={coin.image} alt={coin.name} referrerPolicy="no-referrer" />
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{coin.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{coin.symbol?.toUpperCase()}</div>
                      </div>
                    </div>
                    <div className="w-36 text-right table-col-price">
                      <div className="text-sm text-gray-900 dark:text-white">{formatPrice(coin.current_price)}</div>
                      <div className={`flex items-center justify-end text-xs ${(coin.price_change_percentage_24h || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(coin.price_change_percentage_24h || 0) >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                        {(coin.price_change_percentage_24h || 0).toFixed(2)}%
                      </div>
                    </div>
                    <div className="w-28 text-right table-col-ai">
                      <div className="text-sm text-gray-900 dark:text-white">{formatPrice(coin.estimated_price)}</div>
                      <div className={`text-xs font-bold ${(coin.ai_prediction || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(coin.ai_prediction || 0) >= 0 ? '+' : ''}{coin.ai_prediction}%
                      </div>
                    </div>
                    <div className="w-28 text-sm text-gray-900 dark:text-white text-right table-col-marketcap">{formatBigNumber(coin.market_cap)}</div>
                    <div className="w-28 text-sm text-gray-900 dark:text-white text-right table-col-supply">{coin.circulating_supply ? formatLargeNumber(coin.circulating_supply, '', true) : t('notAvailable')}</div>
                    <div className="w-28 text-sm text-gray-900 dark:text-white text-right table-col-volume">{formatBigNumber(coin.total_volume)}</div>
                    <div className="w-16 text-center table-col-delete">
                      <button onClick={() => handleRemoveFavorite(coin.id)} className="text-red-500 hover:text-red-600" title={t('removeFavorite')}>
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={coin.id} className="group relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
                    <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                      <button onClick={() => handleRemoveFavorite(coin.id)} className="absolute top-3 right-3 text-red-500 hover:text-red-600 transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>

                      {/* 1. Satır */}
                      <div className="grid grid-cols-3 gap-x-2 sm:gap-x-3 mb-3 sm:mb-4">
                        <div className="flex flex-col items-center justify-center -ml-1">
                          <img className="h-10 w-10 sm:h-12 sm:w-12 rounded-full mb-1.5 shadow-md" src={coin.image} alt={coin.name} referrerPolicy="no-referrer" />
                          <span className="font-bold text-gray-800 dark:text-white text-xs sm:text-sm">{coin.symbol?.toUpperCase()}</span>
                        </div>
                        <div className="text-left">
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">{t('priceAndChange')}</div>
                          <div className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">{formatPrice(coin.current_price)}</div>
                          <div className={`text-[10px] sm:text-xs font-semibold flex items-center gap-1 ${(coin.price_change_percentage_24h || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {(coin.price_change_percentage_24h || 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">{t('aiPrediction')}</div>
                          <div className="font-bold text-gray-900 dark:text-white text-sm sm:text-base">{formatPrice(coin.estimated_price)}</div>
                          <div className={`text-[10px] sm:text-xs font-bold ${(coin.ai_prediction || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {(coin.ai_prediction || 0) >= 0 ? '+' : ''}{coin.ai_prediction}%
                          </div>
                        </div>
                      </div>

                      {/* 2. Satır */}
                      <div className="grid grid-cols-3 gap-x-2 sm:gap-x-3 text-center border-t border-gray-200 dark:border-gray-700 pt-3 sm:pt-4">
                        <div>
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">{t('marketCapShort')}</div>
                          <div className="font-semibold text-gray-800 dark:text-white text-xs sm:text-sm">{formatBigNumber(coin.market_cap)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">{t('circulatingSupplyShort')}</div>
                          <div className="font-semibold text-gray-800 dark:text-white text-xs sm:text-sm">{coin.circulating_supply ? formatLargeNumber(coin.circulating_supply, '', true) : t('notAvailable')}</div>
                        </div>
                        <div>
                          <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1">{t('volume24hShort')}</div>
                          <div className="font-semibold text-gray-800 dark:text-white text-xs sm:text-sm">{formatBigNumber(coin.total_volume)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Favorites

