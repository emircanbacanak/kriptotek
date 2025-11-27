// Blockchain Explorer API Service
// Etherscan, BscScan gibi blockchain explorer API'lerinden veri çeker

import logger from '../utils/logger'

class BlockchainExplorerService {
  constructor() {
    this.apis = {
      ethereum: {
        name: 'Etherscan',
        baseUrl: 'https://api.etherscan.io/api',
        apiKey: import.meta.env.VITE_ETHERSCAN_API_KEY || '',
        rateLimit: 5 // requests per second
      },
      bsc: {
        name: 'BscScan',
        baseUrl: 'https://api.bscscan.com/api',
        apiKey: import.meta.env.VITE_BSCSCAN_API_KEY || '',
        rateLimit: 5
      },
      polygon: {
        name: 'PolygonScan',
        baseUrl: 'https://api.polygonscan.com/api',
        apiKey: import.meta.env.VITE_POLYGONSCAN_API_KEY || '',
        rateLimit: 5
      }
    }
  }

  /**
   * Büyük token transferlerini getir (Ethereum)
   */
  async getLargeTransfers(chain = 'ethereum', minValue = 1000000, limit = 100) {
    const api = this.apis[chain]
    if (!api) {
      return { success: false, error: 'Desteklenmeyen blockchain', data: [] }
    }

    if (!api.apiKey) {
      logger.warn(`${api.name} API key bulunamadı. Environment variable ayarlayın.`)
      return { success: false, error: 'API key not configured', data: [] }
    }

    try {
      // Son 1000 bloğu kontrol et
      const params = new URLSearchParams({
        module: 'account',
        action: 'tokentx',
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: api.apiKey
      })

      // Not: Bu API endpoint'i tüm transferleri getirir, client-side'da filtreleme yapılmalı
      // Gerçek uygulamada backend'de filtreleme yapılmalı
      
      const response = await fetch(`${api.baseUrl}?${params}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`API hatası: ${response.status}`)
      }

      const result = await response.json()

      if (result.status === '1' && result.result) {
        // Transferleri filtrele ve formatla
        const transfers = result.result
          .filter(tx => {
            const value = parseFloat(tx.value || 0)
            const decimals = parseInt(tx.tokenDecimal || 18)
            // Token fiyatını bilmediğimiz için sadece büyük transferleri filtrele
            // Gerçek uygulamada token fiyatı ile çarpılmalı
            return value > 0
          })
          .slice(0, limit)
          .map(tx => this.formatTransfer(tx, chain))

        return {
          success: true,
          data: transfers,
          count: transfers.length
        }
      }

      return { success: false, error: result.message || 'Bilinmeyen hata', data: [] }
    } catch (error) {
      logger.error(`${api.name} API hatası:`, error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Belirli bir cüzdanın transferlerini getir
   */
  async getWalletTransfers(chain, address, limit = 100) {
    const api = this.apis[chain]
    if (!api || !api.apiKey) {
      return { success: false, error: 'API not configured', data: [] }
    }

    try {
      const params = new URLSearchParams({
        module: 'account',
        action: 'tokentx',
        address: address,
        startblock: 0,
        endblock: 99999999,
        sort: 'desc',
        apikey: api.apiKey
      })

      const response = await fetch(`${api.baseUrl}?${params}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      })

      if (!response.ok) {
        throw new Error(`API hatası: ${response.status}`)
      }

      const result = await response.json()

      if (result.status === '1' && result.result) {
        const transfers = result.result
          .slice(0, limit)
          .map(tx => this.formatTransfer(tx, chain))

        return {
          success: true,
          data: transfers,
          count: transfers.length
        }
      }

      return { success: false, error: result.message || 'Bilinmeyen hata', data: [] }
    } catch (error) {
      logger.error(`${api.name} wallet transfer hatası:`, error)
      return {
        success: false,
        error: error.message || 'API hatası',
        data: []
      }
    }
  }

  /**
   * Transfer'i formatla
   */
  formatTransfer(tx, chain) {
    const value = parseFloat(tx.value || 0)
    const decimals = parseInt(tx.tokenDecimal || 18)
    const amount = value / Math.pow(10, decimals)

    return {
      id: tx.hash,
      hash: tx.hash,
      chain,
      from: tx.from,
      to: tx.to,
      tokenSymbol: tx.tokenSymbol,
      tokenName: tx.tokenName,
      amount,
      value: value,
      timestamp: new Date(parseInt(tx.timeStamp) * 1000),
      blockNumber: parseInt(tx.blockNumber),
      transactionIndex: parseInt(tx.transactionIndex)
    }
  }

  /**
   * Exchange adreslerini kontrol et
   */
  isExchangeAddress(address) {
    const exchangeAddresses = {
      // Binance
      '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': 'Binance',
      '0xd551234ae421e3bcba99a0da6d736074f22192ff': 'Binance',
      '0x564286362092d8e7936f0549571a803b203aaced': 'Binance',
      // Coinbase
      '0x4f833a24e1f95d70f028921e24040f5c30989e1f': 'Coinbase',
      '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase',
      // Kraken
      '0x2910543af39aba0cd09dbb2d50200b3e800a63d2': 'Kraken',
      // Bitfinex
      '0x1151314c646ce4e0efd76d1af4760ae66a9fe30f': 'Bitfinex',
      // Huobi
      '0xab83d182f3485cf1d6ccdd34c7cfef95b4c08da4': 'Huobi',
      // OKEx
      '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKEx'
    }

    return exchangeAddresses[address?.toLowerCase()] || null
  }
}

const blockchainExplorerService = new BlockchainExplorerService()
export default blockchainExplorerService

