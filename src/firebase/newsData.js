import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  where,
  getDocs,
  Timestamp,
  updateDoc,
  doc,
  writeBatch
} from 'firebase/firestore'
import { db } from './firebaseConfig'
import mongoApiClient from '../services/mongoApiClient'
import realtimeService from '../services/realtimeService'

const NEWS_COLLECTION = 'crypto_news'
const MAX_NEWS_AGE_DAYS = 7 // Haberleri 7 gün sakla
const USE_MONGO = true // MongoDB kullan

/**
 * Haberi MongoDB veya Firestore'a kaydet
 */
export async function saveNewsToFirestore(newsItems) {
  if (!newsItems || newsItems.length === 0) {
    return { savedCount: 0, skippedCount: 0 }
  }

  if (USE_MONGO) {
    try {
      // MongoDB'ye kaydet - URL'yi _id olarak kullan
      const newsToSave = newsItems.map(item => {
        if (!item.url) return null
        return {
          _id: item.url, // URL'yi unique ID olarak kullan
          ...item,
          createdAt: new Date(),
          publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date()
        }
      }).filter(Boolean)

      if (newsToSave.length === 0) {
        return { savedCount: 0, skippedCount: 0 }
      }

      // MongoDB'ye batch insert (upsert - duplicate kontrolü için)
      let savedCount = 0
      let skippedCount = 0

      // Her bir haber için upsert yap (URL unique)
      for (const newsItem of newsToSave) {
        try {
          await mongoApiClient.updateNews(newsItem._id, newsItem)
          savedCount++
        } catch (err) {
          // Eğer hata varsa, yeni kayıt olarak ekle
          try {
            await mongoApiClient.saveNews([newsItem])
            savedCount++
          } catch (e) {
            // Duplicate key hatası - zaten var, skip
            skippedCount++
          }
        }
      }

      console.log(`📰 ${savedCount} yeni haber kaydedildi, ${skippedCount} haber atlandı (MongoDB)`)
      return { savedCount, skippedCount }
    } catch (error) {
      console.error('❌ Haber kaydetme hatası (MongoDB):', error)
      throw error
    }
  } else {
    // Firestore kodu (eski)
    try {
      const newsRef = collection(db, NEWS_COLLECTION)
      const BATCH_SIZE = 300
      const MAX_CONCURRENT_BATCHES = 2
      let totalSaved = 0
      let totalSkipped = 0

      const allUrls = newsItems.map(item => item.url).filter(Boolean)
      if (allUrls.length === 0) {
        return { savedCount: 0, skippedCount: 0 }
      }

      const existingUrlsMap = new Map()
      try {
        const recentNewsQuery = query(
          newsRef,
          orderBy('createdAt', 'desc'),
          limit(100)
        )
        const recentSnapshot = await getDocs(recentNewsQuery)
        recentSnapshot.docs.forEach(doc => {
          const data = doc.data()
          if (data.url) {
            existingUrlsMap.set(data.url, {
              ref: doc.ref,
              data: data
            })
          }
        })
      } catch (err) {
        console.warn('⚠️ Duplicate kontrolü hatası (devam ediliyor):', err.message)
      }

      const batches = []
      for (let i = 0; i < newsItems.length; i += BATCH_SIZE) {
        batches.push(newsItems.slice(i, i + BATCH_SIZE))
      }

      for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
        const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES)
        
        await Promise.all(
          concurrentBatches.map(async (batchItems) => {
            const batch = writeBatch(db)
            let batchSaved = 0
            let batchSkipped = 0

            for (const item of batchItems) {
              if (!item.url) continue
              const existing = existingUrlsMap.get(item.url)
              
              if (!existing) {
                const docRef = doc(newsRef)
                batch.set(docRef, {
                  ...item,
                  createdAt: Timestamp.now(),
                  publishedAt: item.publishedAt ? Timestamp.fromDate(new Date(item.publishedAt)) : Timestamp.now()
                })
                batchSaved++
              } else {
                batch.update(existing.ref, {
                  sentiment: item.sentiment,
                  category: item.category,
                  importance: item.importance,
                  tzHint: item.tzHint || existing.data.tzHint || 'local',
                  updatedAt: Timestamp.now()
                })
                batchSkipped++
              }
            }

            try {
              if (batchSaved > 0 || batchSkipped > 0) {
                await batch.commit()
                totalSaved += batchSaved
                totalSkipped += batchSkipped
              }
            } catch (err) {
              console.error('❌ Batch commit hatası:', err.message)
            }

            await new Promise(resolve => setTimeout(resolve, 200))
          })
        )

        if (i + MAX_CONCURRENT_BATCHES < batches.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      console.log(`📰 ${totalSaved} yeni haber kaydedildi, ${totalSkipped} haber güncellendi`)
      return { savedCount: totalSaved, skippedCount: totalSkipped }
    } catch (error) {
      console.error('❌ Haber kaydetme hatası:', error)
      throw error
    }
  }
}

/**
 * Eski haberleri temizle (7 günden eski)
 */
export async function cleanOldNews() {
  try {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - MAX_NEWS_AGE_DAYS)
    
    const newsRef = collection(db, NEWS_COLLECTION)
    const oldNewsQuery = query(
      newsRef,
      where('publishedAt', '<', Timestamp.fromDate(cutoffDate))
    )
    
    const snapshot = await getDocs(oldNewsQuery)
    
    if (!snapshot.empty) {
      const batch = writeBatch(db)
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref)
      })
      await batch.commit()
      console.log(`🗑️ ${snapshot.size} eski haber temizlendi`)
    }
  } catch (error) {
    console.error('❌ Eski haber temizleme hatası:', error)
  }
}

/**
 * MongoDB veya Firestore'dan haberleri realtime dinle (MongoDB için WebSocket)
 */
export function subscribeToNews(callback, limitCount = 100, errorCallback = null) {
  if (USE_MONGO) {
    let allNews = []
    let isInitialized = false
    
    // İlk yükleme - MongoDB API'den çek
    const loadInitialNews = async () => {
      try {
        const news = await mongoApiClient.getNews({ limit: limitCount, orderBy: 'publishedAt', order: 'desc' })
        
        // MongoDB'den gelen veriyi formatla
        const formattedNews = news.map(item => {
          let publishedAt = item.publishedAt ? new Date(item.publishedAt) : new Date()
          if (item.tzHint === 'utc') {
            publishedAt = new Date(publishedAt.getTime() + (3 * 60 * 60 * 1000))
          }
          return {
            id: item._id || item.url || Math.random().toString(),
            ...item,
            publishedAt,
            createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
          }
        })
        
        formattedNews.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        allNews = formattedNews
        
        if (!isInitialized) {
          isInitialized = true
          callback(allNews)
        }
      } catch (error) {
        console.error('❌ İlk haber yükleme hatası:', error)
        if (errorCallback) {
          errorCallback(error)
        }
        // Hata durumunda boş array gönder (sayfa boş kalmasın)
        callback([])
      }
    }
    
    // İlk yükleme
    loadInitialNews()
    
    // WebSocket'ten gelen güncellemeleri dinle
    const handleNewsUpdate = ({ operationType, documentId, data, fullDocument }) => {
      // data veya fullDocument yoksa sessizce çık
      const newsData = data || fullDocument
      if (!newsData) {
        return
      }
      
      // Yeni haber eklendi veya güncellendi
      // Haberi formatla
      let publishedAt = newsData.publishedAt ? new Date(newsData.publishedAt) : new Date()
      if (newsData.tzHint === 'utc') {
        publishedAt = new Date(publishedAt.getTime() + (3 * 60 * 60 * 1000))
      }
      
      const formattedItem = {
        id: newsData._id || newsData.url || documentId || Math.random().toString(),
        ...newsData,
        publishedAt,
        createdAt: newsData.createdAt ? new Date(newsData.createdAt) : new Date()
      }
      
      // Mevcut listede var mı kontrol et
      const existingIndex = allNews.findIndex(n => n.id === formattedItem.id)
      
      if (existingIndex >= 0) {
        // Güncelle
        allNews[existingIndex] = formattedItem
      } else {
        // Yeni haber ekle (en başa)
        allNews.unshift(formattedItem)
        
        // Limit'i aşmamak için son elemanı çıkar
        if (allNews.length > limitCount) {
          allNews = allNews.slice(0, limitCount)
        }
      }
      
      // Tarihe göre sırala
      allNews.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      
      // Callback çağır
      callback([...allNews])
      
      // Geriye dönük uyumluluk için newsDataUpdated event'ini de tetikle
      window.dispatchEvent(new CustomEvent('newsDataUpdated', {
        detail: {
          documentId,
          data: formattedItem
        }
      }))
    }
    
    // RealtimeService ile crypto_news collection'ını dinle
    const unsubscribeRealtime = realtimeService.subscribe('crypto_news', handleNewsUpdate)
    
    // Ayrıca window event'ini de dinle (geriye dönük uyumluluk için)
    const handleWindowEvent = (event) => {
      if (!event || !event.detail) {
        return
      }
      const { documentId, data } = event.detail
      if (data) {
        handleNewsUpdate({ operationType: 'insert', documentId, data })
      }
    }
    window.addEventListener('newsDataUpdated', handleWindowEvent)
    
    // Cleanup fonksiyonu
    return () => {
      unsubscribeRealtime()
      window.removeEventListener('newsDataUpdated', handleWindowEvent)
    }
  } else {
    // Firestore realtime
    const newsRef = collection(db, NEWS_COLLECTION)
    const newsQuery = query(
      newsRef,
      orderBy('publishedAt', 'desc'),
      limit(limitCount)
    )

    const unsubscribe = onSnapshot(
      newsQuery,
      (snapshot) => {
        const news = snapshot.docs.map(doc => {
          const data = doc.data()
          let publishedAt = data.publishedAt?.toDate?.() || new Date()
          if (data.tzHint === 'utc') {
            publishedAt = new Date(publishedAt.getTime() + (3 * 60 * 60 * 1000))
          }
          return {
            id: doc.id,
            ...data,
            publishedAt,
            createdAt: data.createdAt?.toDate?.() || new Date()
          }
        })
        news.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
        console.log(`🔄 Realtime güncelleme: ${news.length} haber`)
        callback(news)
      },
      (error) => {
        console.error('❌ Realtime dinleme hatası:', error)
      }
    )

    return unsubscribe
  }
}

/**
 * Son güncelleme zamanını al
 */
export async function getLastUpdateTime() {
  try {
    const newsRef = collection(db, NEWS_COLLECTION)
    const lastNewsQuery = query(
      newsRef,
      orderBy('createdAt', 'desc'),
      limit(1)
    )
    
    const snapshot = await getDocs(lastNewsQuery)
    
    if (!snapshot.empty) {
      const lastNews = snapshot.docs[0].data()
      return lastNews.createdAt?.toDate() || null
    }
    
    return null
  } catch (error) {
    console.error('❌ Son güncelleme zamanı alma hatası:', error)
    return null
  }
}

/**
 * Toplam haber sayısını al
 */
export async function getTotalNewsCount() {
  try {
    const newsRef = collection(db, NEWS_COLLECTION)
    const snapshot = await getDocs(newsRef)
    return snapshot.size
  } catch (error) {
    console.error('❌ Haber sayısı alma hatası:', error)
    return 0
  }
}

/**
 * Kategoriye göre haber sayılarını al
 */
export async function getNewsByCategory() {
  try {
    const newsRef = collection(db, NEWS_COLLECTION)
    const snapshot = await getDocs(newsRef)
    
    const categoryCounts = {}
    snapshot.docs.forEach(doc => {
      const category = doc.data().category || 'general'
      categoryCounts[category] = (categoryCounts[category] || 0) + 1
    })
    
    return categoryCounts
  } catch (error) {
    console.error('❌ Kategori sayıları alma hatası:', error)
    return {}
  }
}

/**
 * Tüm haberleri sil (geliştirme aracı)
 */
export async function deleteAllNews(batchSize = 300) {
  try {
    const newsRef = collection(db, NEWS_COLLECTION)
    let totalDeleted = 0
    while (true) {
      const snap = await getDocs(query(newsRef, limit(batchSize)))
      if (snap.empty) break
      const batch = writeBatch(db)
      snap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      totalDeleted += snap.size
      console.log(`🗑️ Silindi: ${totalDeleted}`)
      // Kısa bekleme - güvenli
      await new Promise(r => setTimeout(r, 150))
    }
    console.log(`✅ Bitti. Toplam silinen: ${totalDeleted}`)
    return totalDeleted
  } catch (error) {
    console.error('❌ deleteAllNews hata:', error)
    throw error
  }
}

// Geliştirme kolaylığı: konsoldan çağırmak için window'a bağla
if (typeof window !== 'undefined') {
  // Vite dev ortamında direkt erişim için
  window.__deleteAllNews = deleteAllNews
}

