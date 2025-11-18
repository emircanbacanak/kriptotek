/**
 * Dominance Data Handler
 * CoinMarketCap API'den dominance verilerini çeker
 */

const COINMARKETCAP_API = 'https://pro-api.coinmarketcap.com/v1'

/**
 * CoinMarketCap API'den dominance verilerini çek
 */
async function fetchDominanceData(apiKey) {
  if (!apiKey) {
    throw new Error('CoinMarketCap API key eksik')
  }

  try {
    // 1. Global metrics çek (BTC dominance, market cap)
    const globalResponse = await fetch(`${COINMARKETCAP_API}/global-metrics/quotes/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json'
      }
    })

    if (!globalResponse.ok) {
      throw new Error(`CoinMarketCap Global API error: ${globalResponse.status}`)
    }

    const globalData = await globalResponse.json()
    const globalMetrics = globalData.data

    // 2. Top 100 coins çek (BTC volume için)
    const listingsResponse = await fetch(
      `${COINMARKETCAP_API}/cryptocurrency/listings/latest?limit=100`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          'Accept': 'application/json'
        }
      }
    )

    if (!listingsResponse.ok) {
      throw new Error(`CoinMarketCap Listings API error: ${listingsResponse.status}`)
    }

    const listingsData = await listingsResponse.json()
    const coins = listingsData.data || []

    // BTC'yi bul
    const btc = coins.find(coin => coin.symbol === 'BTC')
    const btcVolume = btc?.quote?.USD?.volume_24h || 0

    // Veriyi formatla
    const btcDominance = globalMetrics.btc_dominance || 0
    const ethDominance = globalMetrics.eth_dominance || 0
    const othersDominance = 100 - btcDominance - ethDominance

    const dominanceData = [
      {
        name: 'BTC',
        value: btcDominance,
        color: '#f7931a',
        change: 0
      },
      {
        name: 'ETH',
        value: ethDominance,
        color: '#627eea',
        change: 0
      },
      {
        name: 'Others',
        value: othersDominance,
        color: '#6b7280',
        change: 0
      }
    ]

    // Volume data (top 8 coin, stablecoinler hariç)
    const STABLECOIN_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FRAX', 'USDD', 'LUSD', 'FEI', 'UST', 'MIM', 'EURS', 'EURT', 'USDE', 'PYUSD', 'USDF', 'FDUSD']
    const volumeData = coins
      .filter(coin => !STABLECOIN_SYMBOLS.includes(coin.symbol))
      .slice(0, 8)
      .map(coin => ({
        name: coin.symbol,
        volume: coin.quote?.USD?.volume_24h || 0,
        dominance: ((coin.quote?.USD?.volume_24h || 0) / (globalMetrics.quote?.USD?.total_volume_24h || 1)) * 100,
        image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
        change: coin.quote?.USD?.percent_change_24h || 0
      }))

    // Top 3 coins
    const top3Coins = coins.slice(0, 3).map(coin => ({
      id: coin.id.toString(),
      name: coin.name,
      symbol: coin.symbol,
      image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
      total_volume: coin.quote?.USD?.volume_24h || 0,
      market_cap: coin.quote?.USD?.market_cap || 0,
      price_change_percentage_24h: coin.quote?.USD?.percent_change_24h || 0
    }))

    // Dominance table data
    const totalMarketCap = globalMetrics.quote?.USD?.total_market_cap || 0
    const dominanceTableData = coins.slice(0, 10).map(coin => ({
      name: coin.name,
      symbol: coin.symbol,
      image: `https://s2.coinmarketcap.com/static/img/coins/64x64/${coin.id}.png`,
      dominance: ((coin.quote?.USD?.market_cap || 0) / totalMarketCap) * 100,
      marketCap: coin.quote?.USD?.market_cap || 0,
      volume: coin.quote?.USD?.volume_24h || 0,
      change: coin.quote?.USD?.percent_change_24h || 0
    }))

    return {
      dominanceData,
      volumeData,
      global: {
        total_market_cap: { usd: globalMetrics.quote?.USD?.total_market_cap || 0 },
        total_volume: { usd: globalMetrics.quote?.USD?.total_volume_24h || 0 },
        btc_dominance: btcDominance,
        eth_dominance: ethDominance,
        active_cryptocurrencies: globalMetrics.active_cryptocurrencies || 0,
        active_exchanges: globalMetrics.active_exchanges || 0
      },
      top3Coins,
      dominanceTableData,
      btcVolume: btcVolume,
      lastUpdate: Date.now()
    }
  } catch (error) {
    throw new Error(`CoinMarketCap API error: ${error.message}`)
  }
}

export { fetchDominanceData }

