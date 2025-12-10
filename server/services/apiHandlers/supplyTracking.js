/**
 * Supply Tracking Handler
 * Her 5 dakikada bir tüm coin'lerin circulating_supply değerlerini snapshot olarak kaydeder
 * 24 saat, 7 gün, 1 ay öncesindeki en eski ve en yeni snapshot'ları bulur
 * Değişimleri hesaplar ve MongoDB'ye kaydeder
 */

/**
 * Supply tracking verilerini güncelle
 * 1. Crypto listesinden circulating_supply değerlerini al
 * 2. Snapshot olarak kaydet
 * 3. 24h/7d/1m değişimlerini hesapla
 * 4. MongoDB'ye kaydet
 */
export async function updateSupplyTracking(db) {
  try {
    if (!db) {
      throw new Error('MongoDB bağlantısı yok')
    }

    const collection = db.collection('api_cache')
    const supplyHistoryCollection = db.collection('supply_history')

    // 1. Crypto listesini MongoDB'den al
    const cryptoDoc = await collection.findOne(
      { _id: 'crypto_list' },
      { maxTimeMS: 10000 } // 10 saniye timeout
    )
    if (!cryptoDoc || !cryptoDoc.data || !Array.isArray(cryptoDoc.data) || cryptoDoc.data.length === 0) {
      console.warn('⚠️ Supply tracking: Crypto listesi bulunamadı')
      return false
    }

    const coins = cryptoDoc.data
    const now = new Date()

    console.log(`📊 Supply tracking güncelleme başladı - ${coins.length} coin, zaman: ${now.toISOString()}`)

    // 2. Snapshot formatı: YYYY-MM-DD-HHMM (örn: 2025-01-15-1430)
    const snapshotKey = now.toISOString().slice(0, 16).replace(/[-T:]/g, '-').replace(/-(\d{2})-(\d{2})$/, '-$1$2')

    // 3. Her coin için circulating_supply snapshot'ı kaydet
    const snapshot = {
      timestamp: now.getTime(),
      date: snapshotKey,
      supplies: {}
    }

    coins.forEach(coin => {
      if (coin.id && coin.circulating_supply !== null && coin.circulating_supply !== undefined) {
        snapshot.supplies[coin.id] = coin.circulating_supply
      }
    })

    // 4. Snapshot'ı MongoDB'ye kaydet
    const supplyCount = Object.keys(snapshot.supplies).length
    console.log(`📸 Snapshot kaydediliyor: ${snapshotKey}, ${supplyCount} coin supply verisi`)

    const saveResult = await supplyHistoryCollection.updateOne(
      { _id: snapshotKey },
      { $set: snapshot },
      { upsert: true, maxTimeMS: 30000 } // 30 saniye timeout
    )

    console.log(`✅ Snapshot kaydedildi: ${snapshotKey}, upserted: ${saveResult.upsertedCount > 0}, modified: ${saveResult.modifiedCount > 0}`)

    // 5. Eski snapshot'ları temizle (30 günden eski)
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000)
    const deleteResult = await supplyHistoryCollection.deleteMany(
      { timestamp: { $lt: thirtyDaysAgo } },
      { maxTimeMS: 30000 } // 30 saniye timeout
    )
    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️ ${deleteResult.deletedCount} eski supply snapshot silindi (30 günden eski)`)
    }

    // 6. Değişimleri hesapla (24h, 7d, 1m)
    const supplyChanges = await calculateSupplyChanges(supplyHistoryCollection, now)

    // 7. Değişimleri MongoDB'ye kaydet
    await collection.updateOne(
      { _id: 'supply_tracking' },
      {
        $set: {
          data: supplyChanges,
          lastUpdate: now.getTime(),
          updatedAt: now
        }
      },
      { upsert: true, maxTimeMS: 30000 } // 30 saniye timeout
    )

    const timeStr = now.toLocaleTimeString('tr-TR')
    console.log(`✅ [${timeStr}] Supply tracking verisi güncellendi (${Object.keys(supplyChanges).length} coin)`)

    return true
  } catch (error) {
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.error(`❌ [${timeStr}] Supply tracking güncelleme hatası:`, error.message)
    return false
  }
}

/**
 * Supply değişimlerini hesapla
 */
async function calculateSupplyChanges(supplyHistoryCollection, now) {
  const changes = {}

  // Zaman aralıkları (milisaniye)
  const hours24 = 24 * 60 * 60 * 1000
  const hours168 = 168 * 60 * 60 * 1000 // 7 gün
  const hours720 = 720 * 60 * 60 * 1000 // 30 gün

  // Tüm snapshot'ları al (son 30 gün)
  // NOT: Eski snapshot'larda timestamp alanı olmayabilir veya Date objesi olabilir
  // Bu yüzden önce tüm snapshot'ları al, sonra filtrele
  const thirtyDaysAgo = now.getTime() - hours720

  // Önce timestamp'i olan snapshot'ları al (daha hızlı)
  // Sonra timestamp'i olmayan snapshot'ları al
  const allSnapshotsRaw = await supplyHistoryCollection
    .find({}, {
      maxTimeMS: 60000, // 60 saniye timeout
      projection: { _id: 1, timestamp: 1, supplies: 1 } // Sadece gerekli alanları çek
    })
    .sort({ _id: 1 }) // _id'ye göre sırala (YYYY-MM-DD-HHMM formatı)
    .limit(1000) // Maksimum 1000 snapshot (30 gün için yeterli - her 5 dakikada bir = ~8640 snapshot, ama limit koyuyoruz)
    .toArray()

  console.log(`📊 MongoDB'den ${allSnapshotsRaw.length} raw snapshot çekildi`)

  // Timestamp'i normalize et ve 30 günden eski olanları filtrele
  const allSnapshots = []
  const updatesToApply = [] // Batch update için

  for (const snapshot of allSnapshotsRaw) {
    let snapshotTime = null

    // 1. Önce timestamp alanını kontrol et
    if (snapshot.timestamp) {
      if (snapshot.timestamp instanceof Date) {
        snapshotTime = snapshot.timestamp.getTime()
      } else if (typeof snapshot.timestamp === 'number') {
        snapshotTime = snapshot.timestamp
      }
    }

    // 2. Timestamp yoksa _id'den çıkar (YYYY-MM-DD-HHMM formatı)
    if (!snapshotTime && snapshot._id && typeof snapshot._id === 'string') {
      try {
        // _id formatı: "2025-11-02-1215" -> Date'e çevir
        const parts = snapshot._id.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/)
        if (parts) {
          const year = parseInt(parts[1])
          const month = parseInt(parts[2]) - 1 // 0-indexed
          const day = parseInt(parts[3])
          const hour = parseInt(parts[4])
          const minute = parseInt(parts[5])
          snapshotTime = new Date(year, month, day, hour, minute).getTime()

          // Timestamp güncellemesini batch'e ekle (her snapshot için ayrı update yerine)
          updatesToApply.push({
            updateOne: {
              filter: { _id: snapshot._id },
              update: { $set: { timestamp: snapshotTime } }
            }
          })
        }
      } catch (error) {
        console.warn(`⚠️ Supply tracking: ${snapshot._id} için timestamp çıkarılamadı:`, error.message)
      }
    }

    // 3. 30 günden eski değilse ekle
    if (snapshotTime && snapshotTime >= thirtyDaysAgo) {
      // Timestamp'i normalize et
      snapshot.timestamp = snapshotTime
      allSnapshots.push(snapshot)
    }
  }

  // Batch update uygula (tüm timestamp güncellemelerini tek seferde yap)
  if (updatesToApply.length > 0) {
    try {
      await supplyHistoryCollection.bulkWrite(updatesToApply, {
        ordered: false, // Paralel çalışsın
        maxTimeMS: 60000 // 60 saniye timeout
      })
      if (updatesToApply.length > 0) {
        console.log(`✅ Supply tracking: ${updatesToApply.length} snapshot için timestamp güncellendi (batch)`)
      }
    } catch (error) {
      console.warn(`⚠️ Supply tracking: Batch timestamp güncelleme hatası:`, error.message)
      // Hata olsa bile devam et
    }
  }

  // Timestamp'e göre sırala
  allSnapshots.sort((a, b) => {
    const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : a.timestamp
    const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : b.timestamp
    return timeA - timeB
  })

  console.log(`📊 Supply tracking: ${allSnapshots.length} snapshot bulundu (değişim hesaplaması için)`)

  if (allSnapshots.length === 0) {
    console.warn('⚠️ Supply tracking: Hiç snapshot yok, değişim hesaplanamıyor')
    return changes
  }

  if (allSnapshots.length === 1) {
    console.warn('⚠️ Supply tracking: Sadece 1 snapshot var, değişimler 0 olarak gösterilecek')
    // Tek snapshot varsa değişimler 0 olarak göster (null yerine - UI'da "-" yerine "0" göstersin)
    const latestSnapshot = allSnapshots[0]
    if (latestSnapshot.supplies) {
      Object.keys(latestSnapshot.supplies).forEach(coinId => {
        changes[coinId] = {
          change24h: 0,
          absoluteChange24h: 0,
          change7d: 0,
          absoluteChange7d: 0,
          change1m: 0,
          absoluteChange1m: 0
        }
      })
    }
    return changes
  }

  // En yeni snapshot
  const latestSnapshot = allSnapshots[allSnapshots.length - 1]
  let latestTime = latestSnapshot.timestamp
  if (latestTime instanceof Date) {
    latestTime = latestTime.getTime()
  } else if (typeof latestTime !== 'number') {
    console.error(`❌ Supply tracking: En yeni snapshot'ta geçersiz timestamp: ${latestSnapshot._id}`)
    return changes
  }
  // Zaman aralıkları için snapshot'ları bul
  const time24hAgo = latestTime - hours24
  const time7dAgo = latestTime - hours168
  const time1mAgo = latestTime - hours720

  // Her zaman aralığı için en eski ve en yeni snapshot'ları bul
  let oldest24h = null
  let newest24h = null
  let oldest7d = null
  let newest7d = null
  let oldest1m = null
  let newest1m = null

  for (const snapshot of allSnapshots) {
    // timestamp alanını number'a çevir (Date objesi ise getTime() kullan)
    let snapshotTime = snapshot.timestamp
    if (snapshotTime instanceof Date) {
      snapshotTime = snapshotTime.getTime()
    } else if (typeof snapshotTime !== 'number') {
      // timestamp yoksa veya geçersizse atla
      console.warn(`⚠️ Supply tracking: Geçersiz timestamp: ${snapshot._id}`, snapshot.timestamp)
      continue
    }

    // 24 saat
    if (snapshotTime >= time24hAgo && snapshotTime <= latestTime) {
      if (!oldest24h || snapshotTime < (oldest24h.timestamp instanceof Date ? oldest24h.timestamp.getTime() : oldest24h.timestamp)) {
        oldest24h = snapshot
      }
      if (!newest24h || snapshotTime > (newest24h.timestamp instanceof Date ? newest24h.timestamp.getTime() : newest24h.timestamp)) {
        newest24h = snapshot
      }
    }

    // 7 gün
    if (snapshotTime >= time7dAgo && snapshotTime <= latestTime) {
      if (!oldest7d || snapshotTime < (oldest7d.timestamp instanceof Date ? oldest7d.timestamp.getTime() : oldest7d.timestamp)) {
        oldest7d = snapshot
      }
      if (!newest7d || snapshotTime > (newest7d.timestamp instanceof Date ? newest7d.timestamp.getTime() : newest7d.timestamp)) {
        newest7d = snapshot
      }
    }

    // 1 ay
    if (snapshotTime >= time1mAgo && snapshotTime <= latestTime) {
      if (!oldest1m || snapshotTime < (oldest1m.timestamp instanceof Date ? oldest1m.timestamp.getTime() : oldest1m.timestamp)) {
        oldest1m = snapshot
      }
      if (!newest1m || snapshotTime > (newest1m.timestamp instanceof Date ? newest1m.timestamp.getTime() : newest1m.timestamp)) {
        newest1m = snapshot
      }
    }
  }


  if (oldest7d && newest7d) {
    const oldest7dTime = oldest7d.timestamp instanceof Date ? oldest7d.timestamp.getTime() : oldest7d.timestamp
    const newest7dTime = newest7d.timestamp instanceof Date ? newest7d.timestamp.getTime() : newest7d.timestamp
    const diff7d = newest7dTime - oldest7dTime
    const diff7dDays = diff7d / (24 * 60 * 60 * 1000)
  } else {
    console.warn(`  ⚠️ 7d: oldest veya newest bulunamadı (oldest7d=${!!oldest7d}, newest7d=${!!newest7d})`)
  }

  if (oldest1m && newest1m) {
    const oldest1mTime = oldest1m.timestamp instanceof Date ? oldest1m.timestamp.getTime() : oldest1m.timestamp
    const newest1mTime = newest1m.timestamp instanceof Date ? newest1m.timestamp.getTime() : newest1m.timestamp
    const diff1m = newest1mTime - oldest1mTime
    const diff1mDays = diff1m / (24 * 60 * 60 * 1000)
  } else {
    console.warn(`  ⚠️ 1m: oldest veya newest bulunamadı (oldest1m=${!!oldest1m}, newest1m=${!!newest1m})`)
  }

  // Tüm coin'ler için değişimleri hesapla
  const allCoinIds = new Set()
  if (latestSnapshot.supplies) {
    Object.keys(latestSnapshot.supplies).forEach(id => allCoinIds.add(id))
  }

  allCoinIds.forEach(coinId => {
    const latestSupply = latestSnapshot.supplies?.[coinId]
    if (latestSupply === null || latestSupply === undefined) {
      return
    }

    // 24 saatlik değişim
    let change24h = null
    let absoluteChange24h = null
    if (oldest24h && newest24h && oldest24h.supplies && newest24h.supplies) {
      const oldest24hTime = oldest24h.timestamp instanceof Date ? oldest24h.timestamp.getTime() : oldest24h.timestamp
      const newest24hTime = newest24h.timestamp instanceof Date ? newest24h.timestamp.getTime() : newest24h.timestamp

      // Eğer oldest ve newest aynı snapshot ise, değişim hesaplama
      if (oldest24hTime !== newest24hTime) {
        const old24h = oldest24h.supplies[coinId]
        const new24h = newest24h.supplies[coinId]
        if (old24h !== null && old24h !== undefined && new24h !== null && new24h !== undefined && old24h > 0) {
          absoluteChange24h = new24h - old24h
          change24h = ((new24h - old24h) / old24h) * 100
        }
      }
    }

    // 7 günlük değişim
    let change7d = null
    let absoluteChange7d = null
    if (oldest7d && newest7d && oldest7d.supplies && newest7d.supplies) {
      const oldest7dTime = oldest7d.timestamp instanceof Date ? oldest7d.timestamp.getTime() : oldest7d.timestamp
      const newest7dTime = newest7d.timestamp instanceof Date ? newest7d.timestamp.getTime() : newest7d.timestamp

      // Eğer oldest ve newest aynı snapshot ise, değişim hesaplama
      if (oldest7dTime !== newest7dTime) {
        const old7d = oldest7d.supplies[coinId]
        const new7d = newest7d.supplies[coinId]
        if (old7d !== null && old7d !== undefined && new7d !== null && new7d !== undefined && old7d > 0) {
          absoluteChange7d = new7d - old7d
          change7d = ((new7d - old7d) / old7d) * 100
        }
      }
    }

    // 1 aylık değişim
    let change1m = null
    let absoluteChange1m = null
    if (oldest1m && newest1m && oldest1m.supplies && newest1m.supplies) {
      const oldest1mTime = oldest1m.timestamp instanceof Date ? oldest1m.timestamp.getTime() : oldest1m.timestamp
      const newest1mTime = newest1m.timestamp instanceof Date ? newest1m.timestamp.getTime() : newest1m.timestamp

      // Eğer oldest ve newest aynı snapshot ise, değişim hesaplama
      if (oldest1mTime !== newest1mTime) {
        const old1m = oldest1m.supplies[coinId]
        const new1m = newest1m.supplies[coinId]
        if (old1m !== null && old1m !== undefined && new1m !== null && new1m !== undefined && old1m > 0) {
          absoluteChange1m = new1m - old1m
          change1m = ((new1m - old1m) / old1m) * 100
        }
      }
    }

    // Forward fill: Eğer değişim yoksa, bir önceki snapshot'tan al (en az 2 snapshot varsa)
    if (change24h === null && allSnapshots.length >= 2) {
      const prevSnapshot = allSnapshots[allSnapshots.length - 2]
      if (prevSnapshot && prevSnapshot.supplies && prevSnapshot.supplies[coinId] !== null && prevSnapshot.supplies[coinId] !== undefined) {
        const prevSupply = prevSnapshot.supplies[coinId]
        if (prevSupply > 0) {
          absoluteChange24h = latestSupply - prevSupply
          change24h = ((latestSupply - prevSupply) / prevSupply) * 100
        }
      }
    }

    // 7d ve 1m için de forward fill (eğer yoksa)
    if (change7d === null && allSnapshots.length >= 2) {
      const prevSnapshot = allSnapshots[allSnapshots.length - 2]
      if (prevSnapshot && prevSnapshot.supplies && prevSnapshot.supplies[coinId] !== null && prevSnapshot.supplies[coinId] !== undefined) {
        const prevSupply = prevSnapshot.supplies[coinId]
        if (prevSupply > 0) {
          absoluteChange7d = latestSupply - prevSupply
          change7d = ((latestSupply - prevSupply) / prevSupply) * 100
        }
      }
    }

    if (change1m === null && allSnapshots.length >= 2) {
      const prevSnapshot = allSnapshots[allSnapshots.length - 2]
      if (prevSnapshot && prevSnapshot.supplies && prevSnapshot.supplies[coinId] !== null && prevSnapshot.supplies[coinId] !== undefined) {
        const prevSupply = prevSnapshot.supplies[coinId]
        if (prevSupply > 0) {
          absoluteChange1m = latestSupply - prevSupply
          change1m = ((latestSupply - prevSupply) / prevSupply) * 100
        }
      }
    }

    // Değişimleri kaydet (0 değerleri de geçerli, sadece null değerler "henüz hesaplanamadı" anlamına gelir)
    changes[coinId] = {
      change24h: change24h !== null ? Number(change24h.toFixed(2)) : null,
      absoluteChange24h: absoluteChange24h !== null ? absoluteChange24h : null,
      change7d: change7d !== null ? Number(change7d.toFixed(2)) : null,
      absoluteChange7d: absoluteChange7d !== null ? absoluteChange7d : null,
      change1m: change1m !== null ? Number(change1m.toFixed(2)) : null,
      absoluteChange1m: absoluteChange1m !== null ? absoluteChange1m : null
    }

  })

  return changes
}

