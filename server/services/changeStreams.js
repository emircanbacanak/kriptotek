/**
 * MongoDB Change Streams Servisi
 * MongoDB'deki değişiklikleri dinler ve WebSocket üzerinden client'lara yayınlar
 */

let changeStreams = new Map() // Map<collectionName, changeStream>

export function startChangeStreams(db, wss) {
  // İzlenecek koleksiyonlar
  const collectionsToWatch = [
    'api_cache', // crypto_list, dominance_data, fear_greed, vb.
    'trending_data', // trending coin analizleri
    'ohlc_data',
    'crypto_news'
  ]

  // WebSocket bağlantılarını yönet (wss.clients kullan)
  const broadcastToClients = (message) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(message)
        } catch (error) {
          console.error('❌ WebSocket mesaj gönderme hatası:', error)
        }
      }
    })
  }

  // Her koleksiyon için change stream başlat
  collectionsToWatch.forEach(async (collectionName) => {
    try {
      const collection = db.collection(collectionName)
      
      // Change stream oluştur
      const changeStream = collection.watch([], {
        fullDocument: 'updateLookup' // Güncellenen dökümanın tam halini al
      })

      changeStreams.set(collectionName, changeStream)

      console.log(`👂 Change stream başlatıldı: ${collectionName}`)

      // Değişiklikleri dinle
      changeStream.on('change', (change) => {
        // Tüm client'lara yayınla
        const message = JSON.stringify({
          type: 'change',
          collection: collectionName,
          operationType: change.operationType, // insert, update, replace, delete
          documentId: change.documentKey?._id,
          fullDocument: change.fullDocument
        })

        broadcastToClients(message)
      })

      changeStream.on('error', (error) => {
        console.error(`❌ Change stream hatası (${collectionName}):`, error)
        // Yeniden bağlanmayı dene
        setTimeout(() => {
          if (changeStreams.has(collectionName)) {
            changeStreams.delete(collectionName)
            startChangeStreams(db, wss) // Recursive olarak yeniden başlat
          }
        }, 5000)
      })
    } catch (error) {
      console.error(`❌ Change stream başlatılamadı (${collectionName}):`, error)
    }
  })

  console.log(`✅ ${collectionsToWatch.length} change stream başlatıldı`)
}

export function stopChangeStreams() {
  changeStreams.forEach((stream, collectionName) => {
    try {
      stream.close()
      console.log(`🛑 Change stream durduruldu: ${collectionName}`)
    } catch (error) {
      console.error(`❌ Change stream kapatma hatası (${collectionName}):`, error)
    }
  })
  changeStreams.clear()
}

