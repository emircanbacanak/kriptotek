/**
 * Whale Alert API Handler
 * Whale Alert API'den büyük transferleri çeker ve MongoDB'ye cache'ler
 */

const WHALE_ALERT_API = 'https://api.whale-alert.io/v1'

/**
 * Whale Alert API'den transaction'ları çek
 * @param {string} apiKey - Whale Alert API key
 * @param {Object} options - Filtreleme seçenekleri
 * @param {number} options.min_value - Minimum değer (USD)
 * @param {string} options.currency - Coin sembolü (BTC, ETH, vb.)
 * @param {number} options.start - Başlangıç zamanı (timestamp)
 * @param {number} options.limit - Sonuç sayısı (max 100)
 */
export async function fetchWhaleTransactions(apiKey, options = {}) {
  if (!apiKey) {
    throw new Error('Whale Alert API key eksik')
  }

  try {
    const { fetch } = await import('undici')
    
    const params = new URLSearchParams({
      api_key: apiKey,
      min_value: options.min_value || 1000000, // Varsayılan $1M
      ...(options.currency && { currency: options.currency }),
      ...(options.start && { start: options.start }),
      ...(options.limit && { limit: Math.min(options.limit, 100) })
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 saniye timeout

    try {
      const response = await fetch(`${WHALE_ALERT_API}/transactions?${params}`, {
        headers: {
          'Accept': 'application/json'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit aşıldı. Lütfen bir dakika sonra tekrar deneyin.')
        }
        throw new Error(`Whale Alert API hatası: ${response.status}`)
      }

      const result = await response.json()

      if (result.result === 'success' && result.transactions) {
        return {
          success: true,
          transactions: result.transactions.map(tx => formatTransaction(tx)),
          count: result.count || result.transactions.length,
          cursor: result.cursor
        }
      }

      return {
        success: false,
        error: result.message || 'Bilinmeyen hata',
        transactions: []
      }
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  } catch (error) {
    throw new Error(`Whale Alert API error: ${error.message || 'Bilinmeyen hata'}`)
  }
}

/**
 * Transaction'ı formatla
 */
function formatTransaction(tx) {
  return {
    id: tx.id || tx.hash,
    hash: tx.hash,
    blockchain: tx.blockchain,
    symbol: tx.symbol,
    amount: parseFloat(tx.amount) || 0,
    amount_usd: parseFloat(tx.amount_usd) || 0,
    from: {
      address: tx.from?.address,
      owner: tx.from?.owner,
      owner_type: tx.from?.owner_type // exchange, unknown, individual
    },
    to: {
      address: tx.to?.address,
      owner: tx.to?.owner,
      owner_type: tx.to?.owner_type
    },
    timestamp: tx.timestamp ? new Date(tx.timestamp * 1000) : new Date(),
    transaction_count: tx.transaction_count || 1,
    type: determineTransactionType(tx)
  }
}

/**
 * Transaction tipini belirle
 */
function determineTransactionType(tx) {
  const fromType = tx.from?.owner_type
  const toType = tx.to?.owner_type

  if (fromType === 'exchange' && toType === 'exchange') {
    return 'exchange_to_exchange'
  } else if (fromType === 'exchange' && toType !== 'exchange') {
    return 'exchange_outflow' // Exchange'den çıkış
  } else if (fromType !== 'exchange' && toType === 'exchange') {
    return 'exchange_inflow' // Exchange'e giriş
  } else if (fromType === 'unknown' && toType === 'unknown') {
    return 'wallet_to_wallet'
  }

  return 'unknown'
}

/**
 * Exchange inflow/outflow hesapla
 */
export function calculateExchangeFlow(transactions) {
  const flow = {
    inflow: 0,   // Exchange'e giriş
    outflow: 0,  // Exchange'den çıkış
    net: 0,
    byExchange: {},
    byCurrency: {}
  }

  transactions.forEach(tx => {
    const amount = tx.amount_usd || 0
    
    if (tx.type === 'exchange_inflow') {
      flow.inflow += amount
      const exchange = tx.to?.owner || 'Unknown'
      flow.byExchange[exchange] = (flow.byExchange[exchange] || 0) + amount
    } else if (tx.type === 'exchange_outflow') {
      flow.outflow += amount
      const exchange = tx.from?.owner || 'Unknown'
      flow.byExchange[exchange] = (flow.byExchange[exchange] || 0) - amount
    }

    const currency = tx.symbol || 'Unknown'
    if (!flow.byCurrency[currency]) {
      flow.byCurrency[currency] = { inflow: 0, outflow: 0 }
    }
    
    if (tx.type === 'exchange_inflow') {
      flow.byCurrency[currency].inflow += amount
    } else if (tx.type === 'exchange_outflow') {
      flow.byCurrency[currency].outflow += amount
    }
  })

  flow.net = flow.inflow - flow.outflow

  return flow
}

