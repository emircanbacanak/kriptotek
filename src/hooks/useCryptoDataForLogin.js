// Login sayfası için kripto veri hook'u
// GlobalDataManager'dan veri alır

import { useState, useEffect } from 'react'
import globalDataManager from '../managers/globalDataManager'

const useCryptoDataForLogin = () => {
  const [cryptoData, setCryptoData] = useState({
    topGainer: { name: 'Bitcoin', symbol: 'BTC', change: '+2.5%' },
    topTrader: { name: 'Ethereum', symbol: 'ETH', volume: '$1.2B' },
    topProfit: { name: 'Solana', symbol: 'SOL', change: '+15.3%' }
  })
  const [tickerData, setTickerData] = useState([])

  useEffect(() => {
    // Mevcut veriyi al
    const currentData = globalDataManager.getData()
    
    if (currentData.coins && currentData.coins.length > 0) {
      updateCryptoData(currentData.coins)
    }

    // Abone ol - veri güncellendiğinde bildirim al
    const unsubscribe = globalDataManager.subscribe((data) => {
      if (data.coins && data.coins.length > 0) {
        updateCryptoData(data.coins)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const updateCryptoData = (cryptoList) => {
    if (!cryptoList || cryptoList.length === 0) return

    const topGainer = cryptoList
      .filter((coin) => coin.price_change_percentage_24h > 0)
      .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)[0]

    const topTrader = cryptoList
      .filter((coin) => coin.total_volume > 0)
      .sort((a, b) => b.total_volume - a.total_volume)[0]

    const topProfit = cryptoList
      .filter((coin) => coin.market_cap > 0)
      .sort((a, b) => b.market_cap - a.market_cap)[0]

    setCryptoData({
      topGainer: {
        name: topGainer?.name || 'Bitcoin',
        symbol: topGainer?.symbol?.toUpperCase() || 'BTC',
        change: topGainer ? `+${topGainer.price_change_percentage_24h?.toFixed(1)}%` : '+2.5%'
      },
      topTrader: {
        name: topTrader?.name || 'Ethereum',
        symbol: topTrader?.symbol?.toUpperCase() || 'ETH',
        volume: topTrader ? `$${(topTrader.total_volume / 1000000000).toFixed(1)}B` : '$1.2B'
      },
      topProfit: {
        name: topProfit?.name || 'Solana',
        symbol: topProfit?.symbol?.toUpperCase() || 'SOL',
        change: topProfit ? `+${topProfit.price_change_percentage_24h?.toFixed(1)}%` : '+15.3%'
      }
    })

    const popularCoins = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano', 'dogecoin', 'matic-network']
    const tickerCoins = popularCoins
      .map((coinId) => cryptoList.find((coin) => coin.id === coinId))
      .filter(Boolean)

    if (tickerCoins.length > 0) {
      const newTickerData = tickerCoins.slice(0, 8).map((coin) => ({
        symbol: coin.symbol?.toUpperCase() || 'BTC',
        change: coin.price_change_percentage_24h
          ? `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(1)}%`
          : '+0.0%',
        price: coin.current_price ? `$${coin.current_price.toLocaleString()}` : '$0',
        isPositive: coin.price_change_percentage_24h >= 0
      }))
      setTickerData(newTickerData)
    }
  }

  return { cryptoData, tickerData }
}

export default useCryptoDataForLogin

