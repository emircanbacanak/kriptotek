/**
 * Supply History Service
 * Supply snapshot'larını yönetmek için servis
 */

const getApiUrl = () => {
  if (import.meta.env.VITE_MONGO_API_URL) {
    return import.meta.env.VITE_MONGO_API_URL
  }
  if (import.meta.env.VITE_API_ENDPOINT) {
    return import.meta.env.VITE_API_ENDPOINT
  }
  if (typeof window !== 'undefined' && window.location.origin !== 'http://localhost:5173') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}

const BASE_URL = getApiUrl()

class SupplyHistoryService {
  /**
   * Debug: Belirli bir coin için tüm snapshot'ları console'a yazdır
   * @param {string} coinId - Coin ID (örn: 'bitcoin', 'ethereum')
   */
  async debugCoinSnapshots(coinId) {
    try {
      if (!coinId || typeof coinId !== 'string') {
        console.error(`❌ Geçersiz coin ID: ${coinId}`)
        return []
      }


      // MongoDB'den mevcut snapshot'ları oku (yeni veri çekme)
      const mongoApiUrl = BASE_URL
      const url = `${mongoApiUrl}/supply-history/all`
      console.log(`📡 [Supply History] Mevcut veriler için istek gönderiliyor (sadece okuma): ${url}`)

      // Timeout controller ekle (70 saniye - backend 60 saniye timeout kullanıyor)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        console.error('❌ [Supply History] İstek timeout oldu (70 saniye)')
      }, 70000)

      let response
      try {
        response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        })

        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          console.error('❌ [Supply History] İstek iptal edildi (timeout)')
          throw new Error('İstek timeout oldu (70 saniye)')
        }
        console.error('❌ [Supply History] Fetch hatası:', fetchError)
        throw fetchError
      }

      console.log(`📥 [Supply History] Response status: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ MongoDB API hatası: ${response.status} ${response.statusText}`)
        console.error(`❌ Response body:`, errorText)
        throw new Error(`MongoDB API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log(`📊 [Supply History] Response alındı, ok: ${result.ok}, data length: ${result.data?.length || 0}`)

      if (!result.ok || !result.data) {
        console.error(`❌ MongoDB API response hatası:`, result)
        throw new Error('MongoDB API response hatası')
      }

      const allSnapshots = result.data
      console.log(`📦 [Supply History] Toplam ${allSnapshots.length} snapshot alındı`)

      // Helper function: _id'den timestamp parse et
      function parseTimestampFromId(id) {
        if (!id || typeof id !== 'string') return null
        const parts = id.split('-')
        if (parts.length >= 4) {
          const year = parseInt(parts[0])
          const month = parseInt(parts[1]) - 1
          const day = parseInt(parts[2])
          const timePart = parts[3]
          if (timePart && timePart.length >= 4) {
            const hour = parseInt(timePart.substring(0, 2))
            const minute = parseInt(timePart.substring(2, 4))
            return new Date(Date.UTC(year, month, day, hour, minute)).getTime()
          }
        }
        return null
      }

      // Coin için snapshot'ları filtrele ve parse et
      const snapshots = allSnapshots
        .filter(s => s.supplies && s.supplies[coinId] !== undefined && s.supplies[coinId] !== null)
        .map(s => {
          let timestamp = null

          // Timestamp parse et
          if (s.timestamp) {
            if (s.timestamp instanceof Date) {
              timestamp = s.timestamp.getTime()
            } else if (typeof s.timestamp === 'object' && s.timestamp.$date) {
              timestamp = new Date(s.timestamp.$date).getTime()
            } else if (typeof s.timestamp === 'number') {
              timestamp = s.timestamp
            } else if (typeof s.timestamp === 'string') {
              const parsed = new Date(s.timestamp)
              if (!isNaN(parsed.getTime())) {
                timestamp = parsed.getTime()
              }
            }
          }

          // Timestamp yoksa _id'den parse et
          if (!timestamp || isNaN(timestamp)) {
            timestamp = parseTimestampFromId(s._id)
          }

          return {
            id: s._id,
            timestamp: timestamp,
            supply: s.supplies[coinId]
          }
        })
        .filter(s => s.timestamp && !isNaN(s.timestamp) && s.supply !== undefined && s.supply !== null)
        .sort((a, b) => a.timestamp - b.timestamp)

      console.log(`\n📊 ${coinId.toUpperCase()} için ${snapshots.length} snapshot bulundu (MongoDB):\n`)

      if (snapshots.length === 0) {
        console.log(`❌ ${coinId} için hiç snapshot bulunamadı`)
        console.log(`💡 MongoDB'de ${allSnapshots.length} toplam snapshot var`)

        // İlk snapshot'ta hangi coin'ler var kontrol et
        if (allSnapshots.length > 0) {
          const firstSnapshot = allSnapshots[0]
          if (firstSnapshot.supplies && typeof firstSnapshot.supplies === 'object') {
            const coinIds = Object.keys(firstSnapshot.supplies).sort()
            console.log(`\n📋 İlk snapshot'ta bulunan coin'ler (${coinIds.length} adet):`)
            console.log(`   ${coinIds.slice(0, 50).join(', ')}${coinIds.length > 50 ? ` ... (+${coinIds.length - 50} coin daha)` : ''}`)

            // Benzer coin ID'leri bul (case-insensitive)
            const similar = coinIds.filter(id =>
              id.toLowerCase().includes(coinId.toLowerCase()) ||
              coinId.toLowerCase().includes(id.toLowerCase())
            )
            if (similar.length > 0) {
              console.log(`\n💡 Benzer coin ID'leri bulundu: ${similar.join(', ')}`)
              console.log(`   Deneyin: window.supplyHistoryService.debugCoinSnapshots('${similar[0]}')`)
            }
          }
        }

        return []
      }

      // İlk ve son snapshot'ları göster
      console.log(`📅 İlk snapshot: ${new Date(snapshots[0].timestamp).toLocaleString('tr-TR')} → Supply: ${snapshots[0].supply.toLocaleString('tr-TR')}`)
      console.log(`📅 Son snapshot: ${new Date(snapshots[snapshots.length - 1].timestamp).toLocaleString('tr-TR')} → Supply: ${snapshots[snapshots.length - 1].supply.toLocaleString('tr-TR')}`)

      // Tüm snapshot'ları listele
      console.log(`\n📋 Tüm snapshot'lar (${snapshots.length} adet):\n`)
      snapshots.forEach((snap, index) => {
        const date = new Date(snap.timestamp)
        const change = index > 0 ? (snap.supply - snapshots[index - 1].supply) : 0
        const changePercent = index > 0 ? ((change / snapshots[index - 1].supply) * 100).toFixed(4) : '0.0000'
        const changeStr = index > 0 ? ` (${change > 0 ? '+' : ''}${change.toLocaleString('tr-TR')}, ${changePercent}%)` : ''
        console.log(`${(index + 1).toString().padStart(4)}. ${snap.id} → ${date.toLocaleString('tr-TR')} → ${snap.supply.toLocaleString('tr-TR')}${changeStr}`)
      })

      return snapshots
    } catch (error) {
      console.error('❌ Debug snapshot hatası:', error)
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      })
      return []
    }
  }
}

// Singleton instance
const supplyHistoryService = new SupplyHistoryService()

// Window'a ekle (console'dan erişim için)
if (typeof window !== 'undefined') {
  window.supplyHistoryService = supplyHistoryService
}

export default supplyHistoryService
