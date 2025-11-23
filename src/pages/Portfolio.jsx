import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import useCryptoData from '../hooks/useCryptoData'
import { convertCurrency, formatCurrency, formatLargeNumber } from '../utils/currencyConverter'
import { Wallet, Plus, Edit2, Trash2, TrendingUp, TrendingDown, X, Target, AlertTriangle, Zap, DollarSign, ArrowUpRight, ArrowDownRight, Sparkles, BarChart3, Activity, ChevronDown, Search } from 'lucide-react'
import { updatePageSEO } from '../utils/seoMetaTags'
import logger from '../utils/logger'

const Portfolio = () => {
  const { t, language } = useLanguage()
  const { currency } = useCurrency()
  const { user } = useAuth()
  const { isDark } = useTheme()
  
  const { coins } = useCryptoData()
  
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPosition, setEditingPosition] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [showCoinDropdown, setShowCoinDropdown] = useState(false)
  const [coinSearchTerm, setCoinSearchTerm] = useState('')
  const coinDropdownRef = useRef(null)
  const [formData, setFormData] = useState({
    coinId: '',
    isLeveraged: false,
    leverage: 1,
    type: 'long',
    investmentAmount: '',
    entryPrice: '',
    stopLoss: '',
    takeProfit: ''
  })
  const isMountedRef = useRef(true)

  useEffect(() => {
    updatePageSEO('portfolio', language)
  }, [language])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Close coin dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (coinDropdownRef.current && !coinDropdownRef.current.contains(event.target)) {
        setShowCoinDropdown(false)
        setCoinSearchTerm('')
      }
    }
    if (showCoinDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showCoinDropdown])

  // Filter coins based on search term
  const filteredCoinsForSelection = useMemo(() => {
    if (!coins) return []
    const coinsList = coins.slice(0, 100)
    if (!coinSearchTerm.trim()) return coinsList
    
    const searchLower = coinSearchTerm.toLowerCase().trim()
    return coinsList.filter(coin => {
      const nameLower = coin.name?.toLowerCase() || ''
      const symbolLower = coin.symbol?.toLowerCase() || ''
      return nameLower.includes(searchLower) || symbolLower.includes(searchLower)
    })
  }, [coins, coinSearchTerm])

  const loadPortfolio = useCallback(async () => {
    if (!user || !user.uid) {
      setPositions([])
      setLoading(false)
      return
    }

    if (!isMountedRef.current) {
      return
    }

    try {
      setLoading(true)
      // Production'da otomatik tespit: environment variable yoksa window.location.origin kullan
      const getApiUrl = () => {
        if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
        if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
        // Production'da (localhost değilse) window.location.origin kullan
        if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
          return window.location.origin
        }
        return 'http://localhost:3000'
      }
      const apiUrl = `${getApiUrl()}/api/portfolio/${user.uid}`
      
      let response
      try {
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'omit'
        })
      } catch (fetchError) {
        // Network hatası - sessizce handle et
        if (isMountedRef.current) {
          setPositions([])
          setLoading(false)
        }
        return
      }
      
      if (!response || !response.ok) {
        // Hata durumunda boş portfolio döndür (loglama yok)
        if (isMountedRef.current) {
          setPositions([])
          setLoading(false)
        }
        return
      }

      try {
        const result = await response.json()
        if (isMountedRef.current) {
          if (result.success && result.data) {
            setPositions(result.data.positions || [])
          } else {
            setPositions([])
          }
        }
      } catch (parseError) {
        // JSON parse hatası - boş portfolio döndür
        if (isMountedRef.current) {
          setPositions([])
        }
      }
    } catch (error) {
      // Tüm hatalar - sessizce handle et
      if (isMountedRef.current) {
        setPositions([])
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [user])

  useEffect(() => {
    loadPortfolio()
  }, [loadPortfolio])

  const selectedCoin = useMemo(() => {
    if (!formData.coinId || !coins) return null
    return coins.find(c => c.id === formData.coinId)
  }, [formData.coinId, coins])

  // Coin'in fiyatından küsürat sayısını hesapla (yuvarlama yapmadan)
  const getDecimalPlaces = useCallback((price) => {
    if (!price || price === 0 || isNaN(price)) return 8 // Default max decimals
    
    const numPrice = parseFloat(price)
    if (!numPrice || isNaN(numPrice)) return 8
    
    // Sayıyı string'e çevir (bilimsel gösterim olmadan)
    // Eğer sayı çok küçükse (0.000001234 gibi), toFixed ile string'e çevir
    let str = numPrice.toString()
    
    // Bilimsel gösterim kontrolü (e notation) - 0.000001234 gibi küçük sayılar için
    if (str.includes('e') || str.includes('E')) {
      const parts = str.split(/[eE]/)
      const mantissa = parseFloat(parts[0])
      const exponent = parseInt(parts[1]) || 0
      
      if (exponent < 0) {
        // Negatif üs: 1.234e-6 -> 0.000001234
        // Mantissa'daki ondalık basamakları say
        const mantissaStr = mantissa.toString()
        const mantissaDecimals = mantissaStr.includes('.') ? mantissaStr.split('.')[1].length : 0
        // Toplam ondalık basamak sayısı: |exponent| + mantissa'daki ondalık basamaklar
        return Math.abs(exponent) + mantissaDecimals
      }
      // Pozitif üs için mantissa'daki ondalık basamakları döndür
      const mantissaStr = mantissa.toString()
      return mantissaStr.includes('.') ? mantissaStr.split('.')[1].length : 0
    }
    
    // Normal ondalık sayı kontrolü - son sıfırları da dahil et (coin'in gerçek formatı)
    if (str.includes('.')) {
      const decimalPart = str.split('.')[1]
      // Coin'in fiyatındaki tüm küsüratları say (son sıfırlar dahil)
      // Örnek: 50.00 -> 2, 0.001200 -> 6, 0.000001234 -> 9
      // En az 2 küsürat döndür (fiyatlar genelde 2 küsüratla gösterilir), en fazla 18
      return Math.max(2, Math.min(decimalPart.length, 18))
    }
    
    // Tam sayı ise default 2 küsürat döndür
    return 2
  }, [])

  // Giriş fiyatını coin'in küsürat sayısına göre formatlanmış olarak hesapla
  const formattedEntryPrice = useMemo(() => {
    // Eğer entryPrice yoksa, placeholder'ı göster
    if (!formData.entryPrice) {
      return ''
    }
    
    // Eğer selectedCoin yoksa, entryPrice'ı olduğu gibi döndür
    if (!selectedCoin || !selectedCoin.current_price) {
      return formData.entryPrice
    }
    
    const numValue = parseFloat(formData.entryPrice)
    if (isNaN(numValue)) {
      return formData.entryPrice
    }
    
    // Coin'in fiyatından küsürat sayısını hesapla
    const decimalPlaces = getDecimalPlaces(selectedCoin.current_price)
    
    // Formatlanmış değeri döndür (yuvarlama yapmadan)
    return numValue.toFixed(decimalPlaces)
  }, [formData.entryPrice, selectedCoin, getDecimalPlaces])

  const calculatedCoinAmount = useMemo(() => {
    if (!selectedCoin || !formData.investmentAmount || !formData.entryPrice) return 0
    const investment = parseFloat(formData.investmentAmount) || 0
    const entryPrice = parseFloat(formData.entryPrice) || 0
    const leverage = formData.isLeveraged ? (parseFloat(formData.leverage) || 1) : 1
    
    if (entryPrice <= 0) return 0
    return (investment * leverage) / entryPrice
  }, [selectedCoin, formData.investmentAmount, formData.entryPrice, formData.isLeveraged, formData.leverage])

  const stopLossCalculation = useMemo(() => {
    if (!formData.stopLoss || !formData.entryPrice || !calculatedCoinAmount) return null
    const stopLoss = parseFloat(formData.stopLoss)
    const entryPrice = parseFloat(formData.entryPrice)
    
    if (isNaN(stopLoss) || isNaN(entryPrice)) return null
    
    if (formData.type === 'long') {
      const loss = (stopLoss - entryPrice) * calculatedCoinAmount
      const lossPercent = entryPrice > 0 ? ((stopLoss - entryPrice) / entryPrice) * 100 : 0
      return { loss, lossPercent }
    } else {
      // Short pozisyon: stopLoss yukarıda ise zarar, aşağıda ise kar
      const loss = (stopLoss - entryPrice) * calculatedCoinAmount
      const lossPercent = entryPrice > 0 ? ((stopLoss - entryPrice) / entryPrice) * 100 : 0
      return { loss, lossPercent }
    }
  }, [formData.stopLoss, formData.entryPrice, formData.type, calculatedCoinAmount])

  const takeProfitCalculation = useMemo(() => {
    if (!formData.takeProfit || !formData.entryPrice || !calculatedCoinAmount) return null
    const takeProfit = parseFloat(formData.takeProfit)
    const entryPrice = parseFloat(formData.entryPrice)
    
    if (formData.type === 'long') {
      const profit = (takeProfit - entryPrice) * calculatedCoinAmount
      const profitPercent = entryPrice > 0 ? ((takeProfit - entryPrice) / entryPrice) * 100 : 0
      return { profit, profitPercent }
    } else {
      const profit = (entryPrice - takeProfit) * calculatedCoinAmount
      const profitPercent = entryPrice > 0 ? ((entryPrice - takeProfit) / entryPrice) * 100 : 0
      return { profit, profitPercent }
    }
  }, [formData.takeProfit, formData.entryPrice, formData.type, calculatedCoinAmount])

  const positionsWithData = useMemo(() => {
    if (!coins || coins.length === 0 || !positions || positions.length === 0) {
      return []
    }

    return positions.map(position => {
      const coin = coins.find(c => c.id === position.coinId)
      if (!coin) return null

      const currentPrice = coin.current_price || 0
      const entryPrice = parseFloat(position.entryPrice) || 0
      const investmentAmount = parseFloat(position.investmentAmount) || 0
      const leverage = position.isLeveraged ? (parseFloat(position.leverage) || 1) : 1
      const coinAmount = position.coinAmount || (investmentAmount * leverage / entryPrice)
      
      const currentValue = currentPrice * coinAmount
      const entryValue = entryPrice * coinAmount
      
      // Kar/Zarar = Mevcut Değer - Giriş Değeri (long için pozitif kar, short için negatif kar)
      let profitLoss = 0
      let profitLossPercent = 0
      
      if (position.type === 'long') {
        profitLoss = currentValue - entryValue
        profitLossPercent = entryValue > 0 ? ((currentValue - entryValue) / entryValue) * 100 : 0
      } else if (position.type === 'short') {
        // Short pozisyon: Fiyat düştüğünde kar, yükseldiğinde zarar
        // Giriş fiyatında satıldı (entryValue), mevcut fiyatta geri alınacak (currentValue)
        profitLoss = entryValue - currentValue
        profitLossPercent = entryValue > 0 ? ((entryValue - currentValue) / entryValue) * 100 : 0
      } else {
        // Spot pozisyon: Sadece fiyat artışından kar
        profitLoss = currentValue - entryValue
        profitLossPercent = entryValue > 0 ? ((currentValue - entryValue) / entryValue) * 100 : 0
      }

      let stopLossStatus = null
      let takeProfitStatus = null
      
      // Hassas stop loss kontrolü (kuruşuna kadar)
      if (position.stopLoss) {
        const stopLoss = parseFloat(position.stopLoss)
        // Long pozisyon: Fiyat stop loss'un altına veya eşit olursa tetiklenir
        // Short pozisyon: Fiyat stop loss'un üstüne veya eşit olursa tetiklenir
        if (position.type === 'long' && currentPrice <= stopLoss) {
          stopLossStatus = 'triggered'
        } else if (position.type === 'short' && currentPrice >= stopLoss) {
          stopLossStatus = 'triggered'
        }
      }
      
      // Hassas take profit kontrolü (kuruşuna kadar)
      if (position.takeProfit) {
        const takeProfit = parseFloat(position.takeProfit)
        // Long pozisyon: Fiyat take profit'in üstüne veya eşit olursa tetiklenir
        // Short pozisyon: Fiyat take profit'in altına veya eşit olursa tetiklenir
        if (position.type === 'long' && currentPrice >= takeProfit) {
          takeProfitStatus = 'triggered'
        } else if (position.type === 'short' && currentPrice <= takeProfit) {
          takeProfitStatus = 'triggered'
        }
      }

      return {
        ...position,
        coin,
        currentPrice,
        currentValue,
        entryValue,
        coinAmount,
        profitLoss,
        profitLossPercent,
        stopLossStatus,
        takeProfitStatus
      }
    }).filter(Boolean)
  }, [positions, coins])

  const portfolioSummary = useMemo(() => {
    const totalEntryValue = positionsWithData.reduce((sum, pos) => sum + (pos.entryValue || 0), 0)
    const totalCurrentValue = positionsWithData.reduce((sum, pos) => sum + (pos.currentValue || 0), 0)
    // Kar/Zarar = Her pozisyonun kendi profitLoss değerlerinin toplamı (long ve short için doğru)
    const totalProfitLoss = positionsWithData.reduce((sum, pos) => sum + (pos.profitLoss || 0), 0)
    const totalProfitLossPercent = totalEntryValue > 0 ? (totalProfitLoss / totalEntryValue) * 100 : 0
    
    // Toplam kar (pozitif profitLoss değerlerinin toplamı)
    const totalProfit = positionsWithData.reduce((sum, pos) => {
      const profit = pos.profitLoss || 0
      return sum + (profit > 0 ? profit : 0)
    }, 0)
    
    // Toplam zarar (negatif profitLoss değerlerinin mutlak değerlerinin toplamı)
    const totalLoss = positionsWithData.reduce((sum, pos) => {
      const profit = pos.profitLoss || 0
      return sum + (profit < 0 ? Math.abs(profit) : 0)
    }, 0)

    return {
      totalEntryValue,
      totalCurrentValue,
      totalProfitLoss,
      totalProfitLossPercent,
      totalProfit,
      totalLoss
    }
  }, [positionsWithData])

  const handleAddPosition = async () => {
    if (!user || !formData.coinId || !formData.investmentAmount || !formData.entryPrice) {
      return
    }
    if (formData.isLeveraged && (!formData.leverage || parseFloat(formData.leverage) < 1)) {
      return
    }

    try {
      // Production'da otomatik tespit
      const getApiUrl = () => {
        if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
        if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
        if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
          return window.location.origin
        }
        return 'http://localhost:3000'
      }
      const response = await fetch(`${getApiUrl()}/api/portfolio/${user.uid}/positions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coinId: formData.coinId,
          isLeveraged: formData.isLeveraged,
          leverage: formData.isLeveraged ? (parseFloat(formData.leverage) || 1) : 1,
          type: formData.type,
          investmentAmount: parseFloat(formData.investmentAmount),
          entryPrice: parseFloat(formData.entryPrice),
          coinAmount: calculatedCoinAmount,
          stopLoss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
          takeProfit: formData.takeProfit ? parseFloat(formData.takeProfit) : null
        })
      })

      if (!response.ok) {
        throw new Error(t('positionAddError') || 'Failed to add position')
      }

      await loadPortfolio()
      setShowAddModal(false)
      resetFormData()
    } catch (error) {
      logger.error('Error adding position:', error)
    }
  }

  const handleUpdatePosition = async () => {
    if (!user || !editingPosition || !formData.coinId || !formData.investmentAmount || !formData.entryPrice) {
      return
    }
    if (formData.isLeveraged && (!formData.leverage || parseFloat(formData.leverage) < 1)) {
      return
    }

    try {
      // Production'da otomatik tespit
      const getApiUrl = () => {
        if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
        if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
        if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
          return window.location.origin
        }
        return 'http://localhost:3000'
      }
      const response = await fetch(`${getApiUrl()}/api/portfolio/${user.uid}/positions/${editingPosition.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coinId: formData.coinId,
          isLeveraged: formData.isLeveraged,
          leverage: formData.isLeveraged ? (parseFloat(formData.leverage) || 1) : 1,
          type: formData.type,
          investmentAmount: parseFloat(formData.investmentAmount),
          entryPrice: parseFloat(formData.entryPrice),
          coinAmount: calculatedCoinAmount,
          stopLoss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
          takeProfit: formData.takeProfit ? parseFloat(formData.takeProfit) : null
        })
      })

      if (!response.ok) {
        throw new Error(t('positionUpdateError') || 'Failed to update position')
      }

      await loadPortfolio()
      setEditingPosition(null)
      setShowAddModal(false)
      resetFormData()
    } catch (error) {
      logger.error('Error updating position:', error)
    }
  }

  const handleDeletePosition = async (positionId) => {
    if (!user) return

    try {
      // Production'da otomatik tespit
      const getApiUrl = () => {
        if (import.meta.env.VITE_MONGO_API_URL) return import.meta.env.VITE_MONGO_API_URL
        if (import.meta.env.VITE_API_ENDPOINT) return import.meta.env.VITE_API_ENDPOINT
        if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
          return window.location.origin
        }
        return 'http://localhost:3000'
      }
      const response = await fetch(`${getApiUrl()}/api/portfolio/${user.uid}/positions/${positionId}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error(t('positionDeleteError') || 'Failed to delete position')
      }

      await loadPortfolio()
      setShowDeleteConfirm(null)
    } catch (error) {
      logger.error('Error deleting position:', error)
    }
  }

  const resetFormData = () => {
    setFormData({
      coinId: '',
      isLeveraged: false,
      leverage: 1,
      type: 'long',
      investmentAmount: '',
      entryPrice: '',
      stopLoss: '',
      takeProfit: ''
    })
  }

  const openAddModal = () => {
    setEditingPosition(null)
    resetFormData()
    setShowAddModal(true)
  }

  const openEditModal = (position) => {
    setEditingPosition(position)
    setFormData({
      coinId: position.coinId,
      isLeveraged: position.isLeveraged || false,
      leverage: position.leverage || 1,
      type: position.type || 'long',
      investmentAmount: position.investmentAmount?.toString() || '',
      entryPrice: position.entryPrice?.toString() || '',
      stopLoss: position.stopLoss?.toString() || '',
      takeProfit: position.takeProfit?.toString() || ''
    })
    setShowAddModal(true)
  }

  const closeModal = () => {
    setShowAddModal(false)
    setEditingPosition(null)
    resetFormData()
  }

  // Coin fiyatına göre formatlanmış fiyat gösterimi (coin'in küsürat sayısına göre, yuvarlama yapmadan)
  const formatPriceWithCoin = useCallback((price, coinId = null) => {
    const numPrice = parseFloat(price)
    if (!price || isNaN(numPrice)) {
      // Geçersiz fiyat için formatCurrency kullan
      const convertedPrice = convertCurrency(price || 0, 'USD', currency)
      return formatCurrency(convertedPrice, currency)
    }
    
    const convertedPrice = convertCurrency(numPrice, 'USD', currency)
    
    // Eğer coinId verilmişse, o coin'in fiyatına göre küsürat sayısını kullan
    let decimalPlaces = 8 // Default
    if (coinId) {
      const coin = coins?.find(c => c.id === coinId)
      if (coin && coin.current_price) {
        decimalPlaces = getDecimalPlaces(coin.current_price)
      }
    }
    
    // Currency symbol
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'TRY' ? '₺' : currency
    
    // Formatted number with calculated decimal places (yuvarlama yapmadan - coin'in fiyat formatına göre)
    const formattedNumber = convertedPrice.toFixed(decimalPlaces)
    
    return `${symbol}${formattedNumber}`
  }, [currency, coins, getDecimalPlaces])

  const formatPrice = useCallback((price) => {
    const convertedPrice = convertCurrency(price, 'USD', currency)
    return formatCurrency(convertedPrice, currency)
  }, [currency])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-800 rounded-full animate-spin"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin" style={{ animationDuration: '1s' }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-xl">
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
              </div>
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 font-semibold text-lg">{t('portfolioLoading')}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Add/Edit Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-700 animate-scale-in">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl blur-lg opacity-50"></div>
                  <div className="relative w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-xl">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                  {editingPosition ? t('editPosition') : t('addPosition')}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all hover:rotate-90"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Coin Selection - Dropdown */}
              <div ref={coinDropdownRef} className="relative">
                <label className="block text-base font-bold text-gray-700 dark:text-gray-300 mb-3">
                  {t('coin')}
                </label>
                <button
                  type="button"
                  onClick={() => setShowCoinDropdown(!showCoinDropdown)}
                  className={`w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 rounded-xl text-left transition-all hover:border-gray-300 dark:hover:border-gray-500 ${
                    formData.coinId
                      ? 'border-blue-500 dark:border-blue-500'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {selectedCoin ? (
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <img
                        src={selectedCoin.image}
                        alt={selectedCoin.name}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                          {selectedCoin.name}
                        </div>
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                          {selectedCoin.symbol.toUpperCase()} - {formatPrice(selectedCoin.current_price || 0)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 font-semibold">
                      {t('selectCoin') || 'Select Coin'}
                    </span>
                  )}
                  <ChevronDown className={`w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform ${showCoinDropdown ? 'transform rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showCoinDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 shadow-2xl max-h-96 overflow-hidden">
                    {/* Search Input */}
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={coinSearchTerm}
                          onChange={(e) => setCoinSearchTerm(e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          placeholder={t('searchCoin')}
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
                          autoFocus
                        />
                      </div>
                    </div>

                    {/* Coin List */}
                    <div className="max-h-80 overflow-y-auto custom-scrollbar">
                      {filteredCoinsForSelection.length > 0 ? (
                        filteredCoinsForSelection.map(coin => (
                          <button
                            key={coin.id}
                            type="button"
                            onClick={() => {
                              const price = coin.current_price || 0
                              const decimalPlaces = getDecimalPlaces(price)
                              const formattedPrice = price > 0 ? parseFloat(price).toFixed(decimalPlaces) : ''
                              setFormData({ ...formData, coinId: coin.id, entryPrice: formattedPrice })
                              setShowCoinDropdown(false)
                              setCoinSearchTerm('')
                            }}
                            className={`w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 ${
                              formData.coinId === coin.id
                                ? 'bg-blue-50 dark:bg-blue-900/20'
                                : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <img
                                src={coin.image}
                                alt={coin.name}
                                className="w-10 h-10 rounded-full flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0 text-left">
                                <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                  {coin.name}
                                </div>
                                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                  {coin.symbol.toUpperCase()}
                                </div>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <div className="font-bold text-sm text-gray-900 dark:text-white">
                                {formatPrice(coin.current_price || 0)}
                              </div>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                          {t('noCoinFound')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Kaldıraç Seçimi */}
              <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-5 border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-400/10 dark:bg-blue-400/5 rounded-full blur-3xl"></div>
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300">
                      {t('isLeveraged')}
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isLeveraged: false, type: 'long' })}
                      className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all transform ${
                        !formData.isLeveraged
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl scale-105'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-2 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      {t('no')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, isLeveraged: true })}
                      className={`flex-1 px-4 py-3 rounded-xl font-bold transition-all transform ${
                        formData.isLeveraged
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl scale-105'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-2 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      {t('yes')}
                    </button>
                  </div>
                  {!formData.isLeveraged && (
                    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold">
                        {t('spotTradeInfo')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Kaldıraç Oranı */}
              {formData.isLeveraged && (
                <div className="animate-slide-down">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                      {t('leverage')} (1x - 100x) <span className="text-red-500">*</span>
                    </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={formData.leverage}
                    onChange={(e) => setFormData({ ...formData, leverage: e.target.value })}
                    onWheel={(e) => e.target.blur()}
                    className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                    placeholder="1"
                  />
                </div>
              )}

              {/* Pozisyon Tipi */}
              {formData.isLeveraged && (
                <div className="animate-slide-down">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                    {t('positionType')}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'long' })}
                      className={`px-3 py-2.5 rounded-xl font-bold transition-all transform flex items-center justify-center gap-2 ${
                        formData.type === 'long'
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg scale-105'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-2 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-sm">{t('long')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, type: 'short' })}
                      className={`px-3 py-2.5 rounded-xl font-bold transition-all transform flex items-center justify-center gap-2 ${
                        formData.type === 'short'
                          ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg scale-105'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border-2 border-gray-200 dark:border-gray-600'
                      }`}
                    >
                      <TrendingDown className="w-4 h-4" />
                      <span className="text-sm">{t('short')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Yatırım Miktarı */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                  {t('investmentAmount')} (USDT)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <input
                    type="number"
                    step="any"
                    value={formData.investmentAmount}
                    onChange={(e) => setFormData({ ...formData, investmentAmount: e.target.value })}
                    onWheel={(e) => e.target.blur()}
                    className="w-full pl-14 pr-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                    placeholder="0.00"
                  />
                </div>
                {formData.investmentAmount && formData.entryPrice && calculatedCoinAmount > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-semibold">
                    ≈ {calculatedCoinAmount.toFixed(8)} {selectedCoin?.symbol.toUpperCase() || ''}
                  </p>
                )}
              </div>

              {/* Giriş Fiyatı */}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                  {t('entryPrice')}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formattedEntryPrice || ''}
                  onChange={(e) => {
                    // Sadece sayı ve nokta virgül karakterlerini kabul et
                    const value = e.target.value.replace(/[^0-9.,]/g, '')
                    setFormData({ ...formData, entryPrice: value })
                  }}
                  onBlur={(e) => {
                    // Input alanından focus çıktığında coin'in küsürat sayısına göre formatla
                    if (selectedCoin && selectedCoin.current_price && e.target.value) {
                      // Virgülü noktaya çevir
                      const normalizedValue = e.target.value.replace(',', '.')
                      const numValue = parseFloat(normalizedValue)
                      if (!isNaN(numValue) && numValue > 0) {
                        const decimalPlaces = getDecimalPlaces(selectedCoin.current_price)
                        const formattedValue = numValue.toFixed(decimalPlaces)
                        setFormData({ ...formData, entryPrice: formattedValue })
                      }
                    }
                  }}
                  onWheel={(e) => e.target.blur()}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder={selectedCoin && selectedCoin.current_price ? parseFloat(selectedCoin.current_price).toFixed(getDecimalPlaces(selectedCoin.current_price)) : "0.00"}
                />
                {selectedCoin && selectedCoin.current_price && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-semibold">
                    {t('currentPrice')}: {formatPriceWithCoin(selectedCoin.current_price, selectedCoin.id)}
                  </p>
                )}
              </div>


              {/* Stop Loss */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-lg">
                    <AlertTriangle className="w-5 h-5 text-white" />
                  </div>
                  {t('stopLoss')} <span className="text-xs text-gray-500 font-normal">({t('optional')})</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.stopLoss}
                  onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  placeholder={t('stopLossPlaceholder')}
                />
                {stopLossCalculation && (
                  <div className={`mt-4 p-4 rounded-2xl border-2 animate-slide-down shadow-lg ${
                    stopLossCalculation.loss < 0 
                      ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-300 dark:border-red-800' 
                      : 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-300 dark:border-green-800'
                  }`}>
                    <div className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      {t('stopLossResult')}
                    </div>
                    <div className={`text-2xl font-extrabold ${
                      stopLossCalculation.loss < 0 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-green-600 dark:text-green-400'
                    }`}>
                      {stopLossCalculation.loss < 0 ? '-' : '+'}{formatPrice(Math.abs(stopLossCalculation.loss || 0))}
                      <span className="text-base ml-2 font-semibold">
                        ({(() => {
                          const percent = stopLossCalculation.lossPercent !== undefined && !isNaN(stopLossCalculation.lossPercent) 
                            ? stopLossCalculation.lossPercent 
                            : 0
                          return `${percent < 0 ? '' : '+'}${percent.toFixed(2)}`
                        })()}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Take Profit */}
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                    <Target className="w-5 h-5 text-white" />
                  </div>
                  {t('takeProfit')} <span className="text-xs text-gray-500 font-normal">({t('optional')})</span>
                </label>
                <input
                  type="number"
                  step="any"
                  value={formData.takeProfit}
                  onChange={(e) => setFormData({ ...formData, takeProfit: e.target.value })}
                  onWheel={(e) => e.target.blur()}
                  className="w-full px-4 py-3.5 bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  placeholder={t('takeProfitPlaceholder')}
                />
                {takeProfitCalculation && (
                  <div className="bg-gradient-to-r from-green-50 via-emerald-50 to-teal-50 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20 rounded-2xl p-4 mt-4 border-2 border-green-300 dark:border-green-800 animate-slide-down shadow-lg">
                    <div className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                      {t('takeProfitResult')}
                    </div>
                    <div className="text-2xl font-extrabold text-green-600 dark:text-green-400">
                      +{formatPrice(takeProfitCalculation.profit || 0)}
                      <span className="text-base ml-2 font-semibold">
                        (+{(() => {
                          const percent = (takeProfitCalculation.profitPercent !== undefined && !isNaN(takeProfitCalculation.profitPercent)) 
                            ? takeProfitCalculation.profitPercent 
                            : 0
                          return percent.toFixed(2)
                        })()}%)
                      </span>
                    </div>
                  </div>
                )}
              </div>


              <div className="flex gap-4 pt-4">
                <button
                  onClick={closeModal}
                  className="flex-1 px-6 py-3.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all transform hover:scale-105 active:scale-95"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={editingPosition ? handleUpdatePosition : handleAddPosition}
                  className="flex-1 px-6 py-3.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-2xl transition-all transform hover:scale-105 active:scale-95 shadow-xl"
                >
                  {editingPosition ? t('update') : t('add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-gray-100 dark:border-gray-700 animate-scale-in">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl blur-lg opacity-50"></div>
                <div className="relative w-14 h-14 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center shadow-xl">
                  <Trash2 className="w-7 h-7 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {t('deletePosition')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {t('deletePositionConfirmation')}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition-all transform hover:scale-105 active:scale-95"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleDeletePosition(showDeleteConfirm)}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-bold hover:shadow-xl transition-all transform hover:scale-105 active:scale-95 shadow-lg"
              >
                {t('delete') || 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-20 left-10 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-[500px] h-[500px] bg-purple-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-indigo-400/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 dark:from-yellow-600 dark:to-orange-600 rounded-xl blur-2xl opacity-60 animate-pulse"></div>
                <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 dark:from-yellow-600 dark:via-orange-600 dark:to-orange-600 rounded-xl flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform">
                  <Wallet className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-yellow-400 dark:to-orange-400 bg-clip-text text-transparent">
                  {t('portfolio')}
                </h1>
                <p className="text-base text-gray-600 dark:text-gray-300 mt-2">
                  {t('portfolioDescription')}
                </p>
              </div>
            </div>
            <button
              onClick={openAddModal}
              className="group relative px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-yellow-600 dark:via-orange-600 dark:to-orange-600 text-white rounded-xl font-bold hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 dark:from-yellow-700 dark:via-orange-700 dark:to-orange-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <Plus className="w-5 h-5 relative z-10" />
              <span className="relative z-10">{t('addPosition')}</span>
            </button>
          </div>

          {/* Portfolio Summary */}
          <div className="relative z-10">
            {positionsWithData.length > 0 && (
              <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Giriş Değeri */}
              <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-5 hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Giriş Değeri
                  </span>
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(() => {
                    const convertedPrice = convertCurrency(portfolioSummary.totalEntryValue || 0, 'USD', currency)
                    const formatter = new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })
                    return formatter.format(convertedPrice)
                  })()}
                </div>
              </div>

              {/* Mevcut Değer */}
              <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-5 hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t('totalPortfolioValue')}
                  </span>
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {(() => {
                    const convertedPrice = convertCurrency(portfolioSummary.totalCurrentValue || 0, 'USD', currency)
                    const formatter = new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })
                    return formatter.format(convertedPrice)
                  })()}
                </div>
              </div>
              {/* Net Kar/Zarar */}
              <div className={`relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border p-5 hover:shadow-lg transition-all ${
                portfolioSummary.totalProfitLoss >= 0 
                  ? 'border-green-200/50 dark:border-green-700/50' 
                  : 'border-red-200/50 dark:border-red-700/50'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t('totalProfitLoss')}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    portfolioSummary.totalProfitLoss >= 0 
                      ? 'bg-gradient-to-br from-green-500 to-emerald-600' 
                      : 'bg-gradient-to-br from-red-500 to-rose-600'
                  }`}>
                    {portfolioSummary.totalProfitLoss >= 0 ? (
                      <ArrowUpRight className="w-4 h-4 text-white" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-white" />
                    )}
                  </div>
                </div>
                <div className={`text-2xl font-bold ${
                  portfolioSummary.totalProfitLoss >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {(() => {
                    const convertedPrice = convertCurrency(Math.abs(portfolioSummary.totalProfitLoss || 0), 'USD', currency)
                    const formatter = new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: currency,
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })
                    return `${portfolioSummary.totalProfitLoss >= 0 ? '+' : '-'}${formatter.format(convertedPrice)}`
                  })()}
                </div>
                <div className={`text-xs mt-1 font-semibold ${
                  portfolioSummary.totalProfitLossPercent >= 0 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {(() => {
                    const percent = portfolioSummary.totalProfitLossPercent !== undefined && !isNaN(portfolioSummary.totalProfitLossPercent) 
                      ? portfolioSummary.totalProfitLossPercent 
                      : 0
                    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                  })()}
                </div>
              </div>
              {/* Pozisyon Sayısı */}
              <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-5 hover:shadow-lg transition-all">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {t('totalPositions')}
                  </span>
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                    <Activity className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {positionsWithData.length}
                </div>
              </div>
              </div>

              {/* Kar/Zarar Detayları */}
              {(portfolioSummary.totalProfit > 0 || portfolioSummary.totalLoss > 0) && (
                <div className="relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart3 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Detaylı Kar/Zarar Analizi
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {portfolioSummary.totalProfit > 0 && (
                      <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800/50">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Toplam Kar
                          </span>
                        </div>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
                          {(() => {
                            const convertedPrice = convertCurrency(portfolioSummary.totalProfit || 0, 'USD', currency)
                            const formatter = new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: currency,
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })
                            return `+${formatter.format(convertedPrice)}`
                          })()}
                        </span>
                      </div>
                    )}
                    {portfolioSummary.totalLoss > 0 && (
                      <div className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Toplam Zarar
                          </span>
                        </div>
                        <span className="text-lg font-bold text-red-600 dark:text-red-400">
                          {(() => {
                            const convertedPrice = convertCurrency(portfolioSummary.totalLoss || 0, 'USD', currency)
                            const formatter = new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: currency,
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            })
                            return `-${formatter.format(convertedPrice)}`
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          {/* Positions List */}
          <div className="relative z-10">
            {positionsWithData.length === 0 ? (
            <div className="relative bg-white dark:bg-gray-800/95 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-gray-700/50 p-16 text-center overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100/50 to-gray-50 dark:from-gray-800/50 dark:via-gray-700/30 dark:to-gray-800/50"></div>
              <div className="relative">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 dark:from-orange-500/20 dark:to-yellow-500/20 rounded-full blur-2xl opacity-60 animate-pulse"></div>
                  <div className="relative w-24 h-24 bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 dark:from-orange-500 dark:via-orange-600 dark:to-yellow-500 rounded-full flex items-center justify-center shadow-2xl">
                    <Wallet className="w-12 h-12 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {t('noPositions')}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md mx-auto">
                  {t('noPositionsDescription')}
                </p>
                <button
                  onClick={openAddModal}
                  className="group relative px-8 py-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-yellow-600 dark:via-orange-600 dark:to-orange-600 text-white rounded-xl font-bold hover:shadow-2xl transition-all transform hover:scale-110 active:scale-95 flex items-center gap-2 mx-auto overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 dark:from-yellow-700 dark:via-orange-700 dark:to-orange-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <Plus className="w-6 h-6 relative z-10" />
                  <span className="relative z-10">{t('addFirstPosition')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positionsWithData.map((position, index) => {
                const getPositionTypeLabel = () => {
                  if (!position.isLeveraged) return 'S'
                  return position.type === 'long' ? 'L' : 'S'
                }
                
                const getPositionTypeColor = () => {
                  if (!position.isLeveraged) return 'text-slate-600 dark:text-slate-300'
                  return position.type === 'long' 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }

                const isTriggered = position.stopLossStatus === 'triggered' || position.takeProfitStatus === 'triggered'
                const triggerType = position.takeProfitStatus === 'triggered' ? 'takeProfit' : (position.stopLossStatus === 'triggered' ? 'stopLoss' : null)

                return (
                  <div
                    key={position.id}
                    className="group relative bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl border-2 border-gray-200/50 dark:border-gray-700/50 p-5 hover:shadow-2xl transition-all transform hover:scale-[1.02] overflow-hidden"
                    style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both` }}
                  >
                    <div className={`absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity ${
                      position.profitLoss >= 0 
                        ? 'bg-gradient-to-br from-green-400 to-emerald-400' 
                        : 'bg-gradient-to-br from-red-400 to-rose-400'
                    }`}></div>
                    
                    {/* Stop/Take Profit Overlay */}
                    {isTriggered && (
                      <div className={`absolute inset-0 flex items-center justify-center z-30 pointer-events-none ${
                        triggerType === 'takeProfit' 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        <div 
                          className="transform rotate-[-45deg] font-extrabold text-xl md:text-2xl lg:text-3xl opacity-90 drop-shadow-lg"
                          style={{ 
                            textShadow: '1px 1px 4px rgba(0,0,0,0.3)',
                            letterSpacing: '0.05em'
                          }}
                        >
                          {triggerType === 'takeProfit' ? '🎯 HEDEF' : '🛑 STOP LOSS'}
                        </div>
                      </div>
                    )}
                    
                    {/* İçerik - Blur uygulanacak (butonlar hariç) */}
                    <div className="relative">
                      <div className={isTriggered ? 'blur-[1px] pointer-events-none' : ''}>
                        {/* Row 1: Symbol/Icon + Position Type */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          {/* Col 1: Symbol and Icon */}
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="absolute inset-0 bg-gradient-to-br from-blue-400/30 to-indigo-400/30 rounded-full blur-lg"></div>
                              <img
                                src={position.coin.image}
                                alt={position.coin.name}
                                className="relative w-12 h-12 rounded-full ring-2 ring-gray-100 dark:ring-gray-700"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-extrabold text-gray-900 dark:text-white truncate">
                                {position.coin.symbol.toUpperCase()}
                              </div>
                              {position.isLeveraged && (
                                <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                  {position.leverage}x
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Col 2: Position Type + Profit/Loss % */}
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-2xl font-extrabold ${getPositionTypeColor()}`}>
                                {getPositionTypeLabel()}
                              </span>
                              {position.isLeveraged ? (
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                                  position.type === 'long'
                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                                }`}>
                                  {position.type === 'long' ? t('long') : t('short')}
                                </span>
                              ) : (
                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  {t('spot')}
                                </span>
                              )}
                            </div>
                            {/* Profit/Loss Percentage */}
                            {position.profitLossPercent !== undefined && (
                              <div className={`text-sm font-extrabold ${
                                position.profitLossPercent >= 0
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}>
                                {(() => {
                                  const percent = position.profitLossPercent !== undefined && !isNaN(position.profitLossPercent) 
                                    ? position.profitLossPercent 
                                    : 0
                                  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
                                })()}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Entry Price (Left) + Current Price (Right) */}
                        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                          <div className="grid grid-cols-2 gap-4">
                            {/* Left: Entry Price */}
                            <div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 font-bold mb-1">
                                {t('entryPrice')}
                              </div>
                              <div className="text-lg font-extrabold text-gray-900 dark:text-white">
                                {position.coin ? formatPriceWithCoin(position.entryPrice, position.coin.id) : formatPrice(position.entryPrice)}
                              </div>
                            </div>
                            {/* Right: Current Price */}
                            {position.coin && position.currentPrice && (
                              <div className="text-right">
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold mb-1">
                                  {t('currentPrice')}
                                </div>
                                <div className="text-lg font-extrabold text-gray-900 dark:text-white">
                                  {formatPriceWithCoin(position.currentPrice, position.coin.id)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Row 3: Target Price + Stop Price */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          {/* Col 1: Target Price (Green) */}
                          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-200 dark:border-green-800">
                            <div className="text-xs text-green-700 dark:text-green-400 font-bold mb-1">
                              {t('takeProfitShort')}
                            </div>
                            <div className="text-sm font-extrabold text-green-600 dark:text-green-400">
                              {position.takeProfit ? (position.coin ? formatPriceWithCoin(position.takeProfit, position.coin.id) : formatPrice(position.takeProfit)) : '-'}
                            </div>
                          </div>
                          
                          {/* Col 2: Stop Price (Red) */}
                          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 border border-red-200 dark:border-red-800">
                            <div className="text-xs text-red-700 dark:text-red-400 font-bold mb-1">
                              {t('stopLossShort')}
                            </div>
                            <div className="text-sm font-extrabold text-red-600 dark:text-red-400">
                              {position.stopLoss ? (position.coin ? formatPriceWithCoin(position.stopLoss, position.coin.id) : formatPrice(position.stopLoss)) : '-'}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Action Buttons - Blur'dan muaf */}
                      <div className={`flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700 ${isTriggered ? 'relative z-40' : ''}`} style={isTriggered ? { filter: 'none' } : {}}>
                        <button
                          onClick={() => openEditModal(position)}
                          className="flex-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all text-sm font-bold flex items-center justify-center gap-2"
                          style={isTriggered ? { filter: 'none' } : {}}
                        >
                          <Edit2 className="w-4 h-4" />
                          {t('edit') || 'Düzenle'}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(position.id)}
                          className="flex-1 px-3 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-all text-sm font-bold flex items-center justify-center gap-2"
                          style={isTriggered ? { filter: 'none' } : {}}
                        >
                          <Trash2 className="w-4 h-4" />
                          {t('delete') || 'Sil'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-in {
          animation: scale-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .animate-slide-down {
          animation: slide-down 0.4s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(229, 231, 235, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.7);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(55, 65, 81, 0.5);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(96, 165, 250, 0.5);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(96, 165, 250, 0.7);
        }
      `}</style>
    </>
  )
}

export default Portfolio
