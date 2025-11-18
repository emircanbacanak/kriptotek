import express from 'express'
import { MongoClient } from 'mongodb'
import cors from 'cors'
import dotenv from 'dotenv'
import admin from 'firebase-admin'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { fetchDominanceData } from './services/apiHandlers/dominance.js'
import { fetchFearGreedData } from './services/apiHandlers/fearGreed.js'

// .env dosyasını yükle (sadece root dizinden)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Root dizinindeki .env'yi kullan (Heroku için)
const rootEnvPath = join(__dirname, '..', '.env')

if (existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath })
} else {
  // Heroku'da environment variables otomatik yüklenir
  dotenv.config() // Varsayılan olarak process.cwd()'den yükle
}

// Firebase Admin SDK initialization
let firebaseAdmin = null
try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  
  if (serviceAccount) {
    // JSON string olarak verilmişse
    try {
      const serviceAccountJson = JSON.parse(serviceAccount)
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountJson)
      })
      firebaseAdmin = admin
      console.log('✅ Firebase Admin SDK başlatıldı (JSON string)')
    } catch (parseError) {
      console.warn('⚠️ Firebase Service Account JSON parse hatası:', parseError.message)
    }
  } else {
    // Dosya yolu kontrolü
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    let serviceAccountFile = null
    
    if (serviceAccountPath) {
      // Environment variable'dan dosya yolu
      serviceAccountFile = serviceAccountPath.startsWith('/') || serviceAccountPath.match(/^[A-Z]:/) 
        ? serviceAccountPath 
        : join(__dirname, serviceAccountPath)
    } else {
      // Otomatik dosya bulma: server/ klasöründe firebase-adminsdk-*.json dosyasını ara
      try {
        const files = readdirSync(__dirname)
        const firebaseAdminFile = files.find(file => 
          file.includes('firebase-adminsdk') && file.endsWith('.json')
        )
        if (firebaseAdminFile) {
          serviceAccountFile = join(__dirname, firebaseAdminFile)
          console.log(`ℹ️ Firebase Service Account dosyası otomatik bulundu: ${firebaseAdminFile}`)
        }
      } catch (dirError) {
        // Klasör okunamadı, devam et
      }
    }
    
    if (serviceAccountFile && existsSync(serviceAccountFile)) {
      try {
        const serviceAccountJson = JSON.parse(readFileSync(serviceAccountFile, 'utf8'))
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson)
        })
        firebaseAdmin = admin
        console.log('✅ Firebase Admin SDK başlatıldı (dosya yolu)')
      } catch (fileError) {
        console.warn('⚠️ Firebase Service Account dosyası okunamadı:', fileError.message)
      }
    } else {
      // Service Account yok - Firebase kullanıcıları çekilemeyecek
      console.warn('⚠️ Firebase Service Account dosyası bulunamadı')
      console.warn('⚠️ Firebase kullanıcıları çekilemeyecek')
      console.warn('ℹ️ Firebase Service Account JSON eklemek için:')
      console.warn('   1. Firebase Console → https://console.firebase.google.com/')
      console.warn('   2. Projenizi seçin (kriptotek-emir)')
      console.warn('   3. ⚙️ Project Settings → Service accounts sekmesi')
      console.warn('   4. "Generate new private key" butonuna tıklayın')
      console.warn('   5. JSON dosyasını server/ klasörüne koyun')
      console.warn('   6. Veya .env dosyasına ekleyin: FIREBASE_SERVICE_ACCOUNT_PATH=./kriptotek-emir-firebase-adminsdk-*.json')
    }
  }
} catch (error) {
  console.warn('⚠️ Firebase Admin SDK başlatılamadı:', error.message)
  console.warn('⚠️ Firebase kullanıcıları çekilemeyecek')
}

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
// Body parser limit'ini artır (500 coin için yeterli olmalı)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || ''
const DB_NAME = process.env.MONGODB_DB_NAME || 'coin-tracking'
const COLLECTION_NAME = 'user_settings'

let db = null
let client = null

// MongoDB bağlantısı
async function connectToMongoDB() {
  try {
    if (!MONGODB_URI) {
      console.error('❌ MONGODB_URI environment variable eksik!')
      return
    }

    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db(DB_NAME)
    console.log('✅ MongoDB bağlantısı başarılı!')
  } catch (error) {
    console.error('❌ MongoDB bağlantı hatası:', error.message)
  }
}

// User Settings - GET
app.get('/api/user-settings/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    
    const collection = db.collection(COLLECTION_NAME)
    
    const settings = await collection.findOne({ userId })
        
    if (settings) {
      // _id'yi kaldır
      const { _id, ...settingsWithoutId } = settings
           
      return res.json({
        success: true,
        data: settingsWithoutId
      })
    } else {
      return res.status(404).json({
        success: false,
        error: 'User settings not found'
      })
    }
  } catch (error) {
    console.error('❌ GET /api/user-settings/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// User Settings - PUT (create or update)
app.put('/api/user-settings/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const settings = req.body
    
    const collection = db.collection(COLLECTION_NAME)
    
    // Upsert (varsa güncelle, yoksa oluştur)
    const result = await collection.updateOne(
      { userId },
      { 
        $set: {
          ...settings,
          userId,
          updatedAt: Date.now()
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: result.upsertedCount > 0 ? 'User settings created' : 'User settings updated',
      insertedId: result.upsertedId,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('❌ PUT /api/user-settings/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Admin - Get All Users (MongoDB + Firebase Google users)
app.get('/api/admin/users', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection(COLLECTION_NAME)
    const mongoUsers = await collection.find({}).toArray()
    
    // MongoDB kullanıcılarını işle
    const mongoUsersList = mongoUsers.map(user => {
      const { _id, ...userWithoutId } = user
      return {
        uid: userWithoutId.userId,
        email: userWithoutId.email || 'Bilinmiyor',
        displayName: userWithoutId.displayName || 'Kullanıcı',
        photoURL: userWithoutId.photoURL || null,
        isPremium: userWithoutId.isPremium === true || userWithoutId.isPremium === 'true',
        adminEncrypted: userWithoutId.adminEncrypted || null,
        isActive: userWithoutId.isActive !== false, // Varsayılan true
        createdAt: userWithoutId.createdAt || null,
        updatedAt: userWithoutId.updatedAt || null,
        source: 'mongodb'
      }
    })
    
    // Firebase'den Google provider'ı olan kullanıcıları çek
    let firebaseGoogleUsers = []
    if (firebaseAdmin) {
      try {
        const listUsersResult = await firebaseAdmin.auth().listUsers(1000) // Max 1000 kullanıcı
        firebaseGoogleUsers = listUsersResult.users
          .filter(fbUser => {
            // Google provider'ı olan kullanıcıları filtrele
            return fbUser.providerData && fbUser.providerData.some(provider => provider.providerId === 'google.com')
          })
          .map(fbUser => {
            // MongoDB'de zaten varsa atla (duplicate kontrolü)
            const existsInMongo = mongoUsersList.some(mu => mu.uid === fbUser.uid)
            if (existsInMongo) {
              return null
            }
            
            // MongoDB'de yoksa Firebase'den ekle
            return {
              uid: fbUser.uid,
              email: fbUser.email || 'Bilinmiyor',
              displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Kullanıcı'),
              photoURL: fbUser.photoURL || null,
              isPremium: false, // Varsayılan
              adminEncrypted: null, // Varsayılan
              isActive: true, // Varsayılan
              createdAt: fbUser.metadata.creationTime ? new Date(fbUser.metadata.creationTime).getTime() : null,
              updatedAt: fbUser.metadata.lastSignInTime ? new Date(fbUser.metadata.lastSignInTime).getTime() : null,
              source: 'firebase' // Firebase'den geldiğini belirt
            }
          })
          .filter(user => user !== null) // null'ları filtrele
      } catch (firebaseError) {
        console.warn('⚠️ Firebase kullanıcıları çekilemedi:', firebaseError.message)
      }
    }
    
    // MongoDB ve Firebase kullanıcılarını birleştir
    const allUsers = [...mongoUsersList, ...firebaseGoogleUsers]
    
    return res.json({
      success: true,
      users: allUsers
    })
  } catch (error) {
    console.error('❌ GET /api/admin/users error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Admin - Toggle Premium
app.patch('/api/admin/users/:userId/premium', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const { isPremium } = req.body
    
    const collection = db.collection(COLLECTION_NAME)
    
    // Önce kullanıcıyı kontrol et
    let existingUser = await collection.findOne({ userId })
    console.log(`🔍 [Premium Toggle] Kullanıcı kontrolü: ${userId}, MongoDB'de var mı: ${!!existingUser}`)
    
    // Eğer kullanıcı yoksa, Firebase'den bilgilerini çek ve MongoDB'de oluştur
    if (!existingUser) {
      if (firebaseAdmin) {
        try {
          console.log(`🔍 [Premium Toggle] Firebase'den kullanıcı aranıyor: ${userId}`)
          const fbUser = await firebaseAdmin.auth().getUser(userId)
          if (fbUser) {
            console.log(`✅ [Premium Toggle] Firebase kullanıcısı bulundu: ${fbUser.email || 'No email'}`)
            // Firebase'den gelen kullanıcı için MongoDB'de settings oluştur
            const defaultSettings = {
              userId: userId,
              email: fbUser.email || null,
              displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Kullanıcı'),
              photoURL: fbUser.photoURL || null,
              display: {
                currency: 'USD',
                language: 'tr',
                theme: 'light'
              },
              isPremium: isPremium === true || isPremium === 'true',
              isActive: true,
              createdAt: fbUser.metadata.creationTime ? new Date(fbUser.metadata.creationTime).getTime() : Date.now(),
              updatedAt: Date.now()
            }
            
            await collection.insertOne(defaultSettings)
            existingUser = defaultSettings
            console.log(`✅ [Premium Toggle] Firebase kullanıcısı MongoDB'ye eklendi: ${userId}`)
          }
        } catch (fbError) {
          console.error(`❌ [Premium Toggle] Firebase kullanıcısı bulunamadı: ${userId}`, fbError.message)
          console.error(`❌ [Premium Toggle] Firebase hatası detayı:`, fbError)
        }
      } else {
        console.warn(`⚠️ [Premium Toggle] Firebase Admin SDK başlatılmamış, kullanıcı oluşturulamıyor: ${userId}`)
      }
    }
    
    // Kullanıcı hala yoksa hata döndür
    if (!existingUser) {
      console.error(`❌ [Premium Toggle] Kullanıcı bulunamadı (MongoDB ve Firebase'de yok): ${userId}`)
      return res.status(404).json({
        success: false,
        error: `User not found: ${userId}. Kullanıcı ne MongoDB'de ne de Firebase'de bulunamadı.`
      })
    }
    
    // Kullanıcıyı güncelle
    const result = await collection.updateOne(
      { userId },
      { 
        $set: { 
          isPremium: isPremium === true || isPremium === 'true',
          updatedAt: Date.now()
        }
      }
    )
    
    return res.json({
      success: true,
      message: `Kullanıcı ${isPremium ? 'premium' : 'ücretsiz'} olarak güncellendi`
    })
  } catch (error) {
    console.error('❌ PATCH /api/admin/users/:userId/premium error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Admin - Toggle Admin
app.patch('/api/admin/users/:userId/admin', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const { isAdmin, adminEncrypted } = req.body
    
    const collection = db.collection(COLLECTION_NAME)
    
    // Önce kullanıcıyı kontrol et
    let existingUser = await collection.findOne({ userId })
    
    // Eğer kullanıcı yoksa, Firebase'den bilgilerini çek ve MongoDB'de oluştur
    if (!existingUser && firebaseAdmin) {
      try {
        const fbUser = await firebaseAdmin.auth().getUser(userId)
        if (fbUser) {
          // Firebase'den gelen kullanıcı için MongoDB'de settings oluştur
          const defaultSettings = {
            userId: userId,
            email: fbUser.email || null,
            displayName: fbUser.displayName || (fbUser.email ? fbUser.email.split('@')[0] : 'Kullanıcı'),
            photoURL: fbUser.photoURL || null,
            display: {
              currency: 'USD',
              language: 'tr',
              theme: 'light'
            },
            isPremium: false,
            isActive: true,
            adminEncrypted: (isAdmin === true || isAdmin === 'true') && adminEncrypted ? adminEncrypted : null,
            createdAt: fbUser.metadata.creationTime ? new Date(fbUser.metadata.creationTime).getTime() : Date.now(),
            updatedAt: Date.now()
          }
          
          await collection.insertOne(defaultSettings)
          existingUser = defaultSettings
          console.log(`✅ Firebase kullanıcısı MongoDB'ye eklendi: ${userId}`)
        }
      } catch (fbError) {
        console.warn(`⚠️ Firebase kullanıcısı bulunamadı: ${userId}`, fbError.message)
      }
    }
    
    // Kullanıcı hala yoksa hata döndür
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }
    
    // Admin durumunu güncelle (adminEncrypted alanı)
    const updateData = {
      updatedAt: Date.now()
    }
    
    if (isAdmin === true || isAdmin === 'true') {
      // Admin yap - şifreleme frontend'de yapılacak, burada sadece kaydet
      if (adminEncrypted) {
        updateData.adminEncrypted = adminEncrypted
      } else {
        // Eğer şifrelenmiş değer gelmediyse, basit bir flag kullan
        updateData.adminEncrypted = 'U2FsdGVkX1+admin=true' // Placeholder, frontend'de şifrelenecek
      }
    } else {
      // Admin'den çıkar
      updateData.adminEncrypted = null
    }
    
    const result = await collection.updateOne(
      { userId },
      { $set: updateData }
    )
    
    return res.json({
      success: true,
      message: `Kullanıcı ${isAdmin ? 'admin' : 'normal'} olarak güncellendi`
    })
  } catch (error) {
    console.error('❌ PATCH /api/admin/users/:userId/admin error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Admin - Toggle Active/Inactive
app.patch('/api/admin/users/:userId/active', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const { isActive } = req.body
    
    const collection = db.collection(COLLECTION_NAME)
    
    const result = await collection.updateOne(
      { userId },
      { 
        $set: { 
          isActive: isActive !== false,
          updatedAt: Date.now()
        }
      }
    )
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      })
    }
    
    return res.json({
      success: true,
      message: `Kullanıcı ${isActive ? 'aktif' : 'pasif'} olarak güncellendi`
    })
  } catch (error) {
    console.error('❌ PATCH /api/admin/users/:userId/active error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Dominance Data - GET (MongoDB'den çek)
app.get('/api/cache/dominance_data', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'dominance_data' })

    if (cacheDoc && cacheDoc.data) {
      // _id'yi kaldır
      const { _id, ...dataWithoutId } = cacheDoc.data
      
      // ÖNEMLİ: Eğer cacheDoc.historicalData varsa (root level - eski veri yapısı), onu data'ya taşı!
      // Bu geçici bir düzeltme, root level'daki historicalData'yı data içine taşıyoruz
      if (cacheDoc.historicalData && Array.isArray(cacheDoc.historicalData) && cacheDoc.historicalData.length > 0) {
        // Eğer data içinde historicalData yoksa veya daha az gün varsa, root level'dakini kullan
        if (!dataWithoutId.historicalData || !Array.isArray(dataWithoutId.historicalData) || 
            dataWithoutId.historicalData.length < cacheDoc.historicalData.length) {
          dataWithoutId.historicalData = cacheDoc.historicalData
        }
      }
      
      return res.json({
        success: true,
        data: dataWithoutId,
        lastUpdate: cacheDoc.lastUpdate || null
      })
    } else {
      return res.status(404).json({
        success: false,
        error: 'Dominance data not found in cache'
      })
    }
  } catch (error) {
    console.error('❌ GET /api/cache/dominance_data error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Crypto List - GET (MongoDB'den çek) - /cache/crypto_list endpoint'i
app.get('/cache/crypto_list', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'crypto_list' })
    
    if (cacheDoc && cacheDoc.data && Array.isArray(cacheDoc.data) && cacheDoc.data.length > 0) {
      return res.json({
        success: true,
        data: {
          coins: cacheDoc.data,
          lastUpdate: cacheDoc.updatedAt || cacheDoc.lastUpdate || null
        }
      })
    } else {
      return res.status(404).json({ 
        success: false, 
        error: 'Crypto list verisi bulunamadı' 
      })
    }
  } catch (error) {
    console.error('❌ GET /cache/crypto_list error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Currency Rates - GET (MongoDB'den çek)
app.get('/api/cache/currency_rates', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'currency_rates' })
    
    if (!cacheDoc || !cacheDoc.data) {
      return res.status(404).json({ 
        success: false, 
        error: 'Currency rates verisi bulunamadı' 
      })
    }

    // Veri eski mi kontrol et (5 dakika)
    const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika
    const isStale = !cacheDoc.updatedAt || (Date.now() - cacheDoc.updatedAt > CACHE_DURATION)
    
    return res.json({
      success: true,
      data: cacheDoc.data,
      updatedAt: cacheDoc.updatedAt,
      isStale: isStale
    })
  } catch (error) {
    console.error('❌ GET /api/cache/currency_rates error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Currency Rates - PUT (MongoDB'ye kaydet)
app.put('/api/cache/currency_rates', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { data } = req.body
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Currency rates data gerekli'
      })
    }

    const collection = db.collection('api_cache')
    await collection.updateOne(
      { _id: 'currency_rates' },
      { 
        $set: {
          data: data,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: 'Currency rates verisi kaydedildi'
    })
  } catch (error) {
    console.error('❌ PUT /api/cache/currency_rates error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/currency/update - ExchangeRate API'den currency rates çek ve MongoDB'ye kaydet
app.post('/api/currency/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { fetchCurrencyRates } = await import('./services/apiHandlers/currency.js')
    const result = await fetchCurrencyRates()
    
    if (!result.data || Object.keys(result.data).length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No data received from ExchangeRate API'
      })
    }
    
    // MongoDB'ye kaydet
    const collection = db.collection('api_cache')
    await collection.updateOne(
      { _id: 'currency_rates' },
      { 
        $set: {
          data: result.data,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )
    
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.log(`✅ [${timeStr}] Currency rates verisi güncellendi`)
    
    return res.json({
      success: true,
      data: result.data,
      apiStatuses: result.apiStatus.apiStatuses || [{ name: 'ExchangeRate API', success: true }],
      message: 'Currency rates updated'
    })
  } catch (error) {
    console.error('❌ POST /api/currency/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Fear & Greed Index - GET (MongoDB'den çek)
app.get('/api/cache/fear_greed', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'fear_greed' })
    
    if (cacheDoc && cacheDoc.data) {
      // _id'yi kaldır ve data'yı döndür
      const { _id: dataId, ...dataWithoutId } = cacheDoc.data
      return res.json({
        success: true,
        data: dataWithoutId,
        lastUpdate: cacheDoc.lastUpdate || null
      })
    } else {
      return res.status(404).json({
        success: false,
        error: 'Fear & Greed data not found in cache'
      })
    }
  } catch (error) {
    console.error('❌ GET /api/cache/fear_greed error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Fear & Greed Index - PUT (MongoDB'ye kaydet)
app.put('/api/cache/fear_greed', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const fearGreedData = req.body
    
    const collection = db.collection('api_cache')
    
    // Upsert (varsa güncelle, yoksa oluştur)
    const result = await collection.updateOne(
      { _id: 'fear_greed' },
      { 
        $set: {
          data: fearGreedData,
          lastUpdate: Date.now(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: result.upsertedCount > 0 ? 'Fear & Greed data created' : 'Fear & Greed data updated',
      insertedId: result.upsertedId,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('❌ PUT /api/cache/fear_greed error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Dominance Data - PUT (MongoDB'ye kaydet)
app.put('/api/cache/dominance_data', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const dominanceData = req.body
    
    const collection = db.collection('api_cache')
    
    // Mevcut veriyi çek (varsa)
    const existing = await collection.findOne({ _id: 'dominance_data' })
    let mergedData = { ...dominanceData }
    
    // Eğer mevcut veri varsa, merge et (historicalData MUTLAKA korunur)
    if (existing && existing.data) {
      // Historical data'yı öncelikle mevcut veriden al (MongoDB'deki 7 günlük veri)
      // ÖNEMLİ: existing.historicalData varsa (root level - eski veri yapısı), onu data'ya taşı!
      let existingHistorical = existing.data.historicalData || []
      // Eğer root level'da historicalData varsa ve data'dakinden daha fazla gün varsa, onu kullan
      if (existing.historicalData && Array.isArray(existing.historicalData) && 
          existing.historicalData.length > existingHistorical.length) {
        existingHistorical = existing.historicalData
      }
      const newHistorical = dominanceData.historicalData || []

      // Eğer yeni veride historicalData varsa, mevcut ile birleştir (duplicate kontrolü ile)
      let finalHistorical = existingHistorical
      if (newHistorical.length > 0) {
        // Yeni verileri mevcut verilere ekle (aynı tarih varsa güncelle)
        const historicalMap = new Map()
        // Önce mevcut verileri ekle (MongoDB'deki 7 günlük veri - ÖNCELİKLİ)
        existingHistorical.forEach(h => {
          if (h && h.date) historicalMap.set(h.date, h)
        })
        // Sonra yeni verileri ekle/güncelle
        newHistorical.forEach(h => {
          if (h && h.date) historicalMap.set(h.date, h)
        })
        // Map'ten array'e çevir ve tarihe göre sırala
        finalHistorical = Array.from(historicalMap.values()).sort((a, b) => {
          return new Date(a.date) - new Date(b.date)
        })
        // Son 7 günü tut
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        finalHistorical = finalHistorical.filter(h => {
          if (!h || !h.date) return false
          const hDate = new Date(h.date)
          return hDate >= sevenDaysAgo
        })
      }
      
      mergedData = {
        ...existing.data,
        ...dominanceData,
        // Historical data'yı MUTLAKA koru (MongoDB'deki 7 günlük veri)
        historicalData: finalHistorical
      }
    } else {
      // Yeni veri oluşturuluyor, historicalData yoksa boş array
      if (!mergedData.historicalData) {
        mergedData.historicalData = []
      }
    }
    
    // Upsert (varsa güncelle, yoksa oluştur)
    // ÖNEMLİ: Sadece data içindeki verileri kaydet, root level'daki eski alanları temizle
    const result = await collection.updateOne(
      { _id: 'dominance_data' },
      { 
        $set: {
          data: mergedData,
          lastUpdate: Date.now(),
          updatedAt: new Date()
        },
        // Root level'daki eski alanları temizle (artık kullanılmıyor)
        $unset: {
          dominanceData: '',
          volumeData: '',
          historicalData: '', // Root level'daki historicalData artık data içinde
          dominanceTableData: '',
          top3Coins: '',
          global: ''
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: result.upsertedCount > 0 ? 'Dominance data created' : 'Dominance data updated',
      insertedId: result.upsertedId,
      modifiedCount: result.modifiedCount
    })
  } catch (error) {
    console.error('❌ PUT /api/cache/dominance_data error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== USER FAVORITES ENDPOINTS ==========
const FAVORITES_COLLECTION = 'user_favorites'

// GET /api/user-favorites/:userId - Kullanıcının favorilerini getir
app.get('/api/user-favorites/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const collection = db.collection(FAVORITES_COLLECTION)
    
    const favoritesDoc = await collection.findOne({ userId })
    
    if (!favoritesDoc) {
      return res.json({
        success: true,
        favorites: []
      })
    }
    
    return res.json({
      success: true,
      favorites: favoritesDoc.coinIds || []
    })
  } catch (error) {
    console.error('❌ GET /api/user-favorites/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/user-favorites/:userId - Favori ekle
app.post('/api/user-favorites/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const { coinId } = req.body
    
    if (!coinId) {
      return res.status(400).json({
        success: false,
        error: 'coinId gerekli'
      })
    }

    const collection = db.collection(FAVORITES_COLLECTION)
    
    // Mevcut favorileri al
    const existingDoc = await collection.findOne({ userId })
    const currentFavorites = existingDoc?.coinIds || []
    
    // Zaten favorilerde varsa başarılı döndür
    if (currentFavorites.includes(coinId)) {
      return res.json({
        success: true,
        message: 'Favori zaten mevcut',
        favorites: currentFavorites
      })
    }
    
    // Favori ekle
    const updatedFavorites = [...currentFavorites, coinId]
    
    await collection.updateOne(
      { userId },
      {
        $set: {
          coinIds: updatedFavorites,
          updatedAt: Date.now()
        },
        $setOnInsert: {
          createdAt: Date.now()
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: 'Favori eklendi',
      favorites: updatedFavorites
    })
  } catch (error) {
    console.error('❌ POST /api/user-favorites/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// DELETE /api/user-favorites/:userId/:coinId - Favori kaldır
app.delete('/api/user-favorites/:userId/:coinId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId, coinId } = req.params
    const collection = db.collection(FAVORITES_COLLECTION)
    
    // Mevcut favorileri al
    const existingDoc = await collection.findOne({ userId })
    
    if (!existingDoc || !existingDoc.coinIds) {
      return res.json({
        success: true,
        message: 'Favori zaten mevcut değil',
        favorites: []
      })
    }
    
    const currentFavorites = existingDoc.coinIds
    const updatedFavorites = currentFavorites.filter(id => id !== coinId)
    
    // Favori kaldır
    await collection.updateOne(
      { userId },
      {
        $set: {
          coinIds: updatedFavorites,
          updatedAt: Date.now()
        }
      }
    )
    
    return res.json({
      success: true,
      message: 'Favori kaldırıldı',
      favorites: updatedFavorites
    })
  } catch (error) {
    console.error('❌ DELETE /api/user-favorites/:userId/:coinId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// DELETE /api/user-favorites/:userId - Tüm favorileri temizle
app.delete('/api/user-favorites/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const collection = db.collection(FAVORITES_COLLECTION)
    
    await collection.updateOne(
      { userId },
      {
        $set: {
          coinIds: [],
          updatedAt: Date.now()
        },
        $setOnInsert: {
          createdAt: Date.now()
        }
      },
      { upsert: true }
    )
    
    return res.json({
      success: true,
      message: 'Tüm favoriler temizlendi',
      favorites: []
    })
  } catch (error) {
    console.error('❌ DELETE /api/user-favorites/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== DOMINANCE API ENDPOINT ==========
// POST /api/dominance/update - CoinMarketCap API'den dominance verilerini çek ve MongoDB'ye kaydet
app.post('/api/dominance/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY
    if (!COINMARKETCAP_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'CoinMarketCap API key eksik (.env dosyasında COINMARKETCAP_API_KEY tanımlı olmalı)'
      })
    }

    // CoinMarketCap API'den veri çek
    const dominanceData = await fetchDominanceData(COINMARKETCAP_API_KEY)

    // MongoDB'ye kaydet
    const collection = db.collection('api_cache')
    const existing = await collection.findOne({ _id: 'dominance_data' })
    
    let mergedData = { ...dominanceData }
    
    // Historical data'yı koru
    if (existing && existing.data && existing.data.historicalData) {
      mergedData.historicalData = existing.data.historicalData
    } else {
      mergedData.historicalData = []
    }

    // Bugünün snapshot'ını ekle
    const today = new Date().toISOString().split('T')[0]
    const todayIndex = mergedData.historicalData.findIndex(h => h.date === today)
    const snapshot = {
      date: today,
      coin1: dominanceData.dominanceData[0]?.value || 0,
      coin2: dominanceData.dominanceData[1]?.value || 0,
      others: dominanceData.dominanceData[2]?.value || 0
    }

    if (todayIndex >= 0) {
      mergedData.historicalData[todayIndex] = snapshot
    } else {
      mergedData.historicalData.push(snapshot)
    }

    // Son 7 günü tut
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    mergedData.historicalData = mergedData.historicalData
      .filter(h => {
        if (!h || !h.date) return false
        const hDate = new Date(h.date)
        return hDate >= sevenDaysAgo
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    // MongoDB'ye kaydet
    await collection.updateOne(
      { _id: 'dominance_data' },
      { 
        $set: {
          data: mergedData,
          lastUpdate: Date.now(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )

    return res.json({
      success: true,
      data: mergedData,
      message: 'Dominance data updated from CoinMarketCap API'
    })
  } catch (error) {
    console.error('❌ POST /api/dominance/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== FEAR & GREED API ENDPOINT ==========
// POST /api/fear-greed/update - CoinStats API'den Fear & Greed verilerini çek ve MongoDB'ye kaydet
app.post('/api/fear-greed/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const COINSTATS_API_KEY = process.env.COINSTATS_API_KEY
    if (!COINSTATS_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'CoinStats API key eksik (.env dosyasında COINSTATS_API_KEY tanımlı olmalı)'
      })
    }

    // CoinStats API'den veri çek
    const fearGreedData = await fetchFearGreedData(COINSTATS_API_KEY)

    // MongoDB'ye kaydet
    const collection = db.collection('api_cache')
    await collection.updateOne(
      { _id: 'fear_greed' },
      { 
        $set: {
          data: fearGreedData,
          lastUpdate: Date.now(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    )

    return res.json({
      success: true,
      data: fearGreedData,
      message: 'Fear & Greed data updated from CoinStats API'
    })
  } catch (error) {
    console.error('❌ POST /api/fear-greed/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== CRYPTO ENDPOINT ==========
// GET /api/crypto/list - MongoDB'den kripto para listesi çek (cache)
app.get('/api/crypto/list', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'crypto_list' })
    
    // MongoDB'de veri var mı ve taze mi? (5 dakikadan eski değilse)
    const CACHE_DURATION = 5 * 60 * 1000 // 5 dakika
    const now = Date.now()
    
    if (cacheDoc && cacheDoc.data && Array.isArray(cacheDoc.data) && cacheDoc.data.length > 0) {
      const cacheAge = now - (cacheDoc.updatedAt || cacheDoc.lastUpdate || 0)
      
      if (cacheAge < CACHE_DURATION) {
        // Cache taze, MongoDB'den döndür
        return res.json({
          success: true,
          data: cacheDoc.data,
          apiStatuses: [
            { name: 'MongoDB Cache', success: true }
          ],
          source: 'mongodb_cache'
        })
      }
    }
    
    // Cache yok veya eski, API'den çek
    try {
      const { fetchCryptoList } = await import('./services/apiHandlers/crypto.js')
      const result = await fetchCryptoList()
      
      if (result.data && result.data.length > 0) {
        // MongoDB'ye kaydet
        await collection.updateOne(
          { _id: 'crypto_list' },
          { 
            $set: {
              data: result.data,
              updatedAt: now,
              lastUpdate: now
            }
          },
          { upsert: true }
        )
        
        console.log(`✅ Crypto list MongoDB'ye kaydedildi: ${result.data.length} coin`)
        
        return res.json({
          success: true,
          data: result.data,
          apiStatuses: result.apiStatuses || [{ name: 'CoinGecko API', success: true }],
          source: 'api'
        })
      } else {
        // API'den veri gelmedi, cache'den döndür (varsa)
        if (cacheDoc && cacheDoc.data && cacheDoc.data.length > 0) {
          console.log(`⚠️ API'den veri gelmedi, stale cache kullanılıyor: ${cacheDoc.data.length} coin`)
          return res.json({
            success: true,
            data: cacheDoc.data,
            apiStatuses: [
              { name: 'MongoDB Stale Cache', success: true }
            ],
            source: 'mongodb_stale_cache'
          })
        }
        
        throw new Error('No data available from API and no cache found')
      }
    } catch (apiError) {
      console.error('❌ CoinGecko API hatası:', apiError.message)
      
      // API hatası, cache'den döndür (varsa - yaş fark etmez)
      if (cacheDoc && cacheDoc.data && Array.isArray(cacheDoc.data) && cacheDoc.data.length > 0) {
        const cacheAge = now - (cacheDoc.updatedAt || cacheDoc.lastUpdate || 0)
        const cacheAgeMinutes = Math.floor(cacheAge / (60 * 1000))
        console.log(`⚠️ API hatası, fallback cache kullanılıyor: ${cacheDoc.data.length} coin (${cacheAgeMinutes} dakika önce)`)
        
        return res.json({
          success: true,
          data: cacheDoc.data,
          apiStatuses: [
            { name: 'MongoDB Fallback Cache', success: true },
            { name: 'CoinGecko API', success: false, error: apiError.message }
          ],
          source: 'mongodb_fallback_cache'
        })
      }
      
      // Hiç cache yok, boş array döndür (sayfa boş kalmasın)
      console.error('❌ Hiç cache yok, boş array döndürülüyor')
      return res.json({
        success: true,
        data: [],
        apiStatuses: [
          { name: 'CoinGecko API', success: false, error: apiError.message },
          { name: 'MongoDB Cache', success: false, error: 'No cache available' }
        ],
        source: 'error',
        error: apiError.message
      })
    }
  } catch (error) {
    console.error('❌ GET /api/crypto/list error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/crypto/update - CoinGecko API'den kripto para listesi çek ve MongoDB'ye kaydet
app.post('/api/crypto/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { fetchCryptoList } = await import('./services/apiHandlers/crypto.js')
    const result = await fetchCryptoList()
    
    if (!result.data || result.data.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No data received from CoinGecko API'
      })
    }
    
    // MongoDB'ye kaydet
    const collection = db.collection('api_cache')
    await collection.updateOne(
      { _id: 'crypto_list' },
      { 
        $set: {
          data: result.data,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )
    
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.log(`✅ [${timeStr}] Crypto list verisi güncellendi (${result.data.length} coin)`)
    
    // Crypto listesi güncellendiğinde trending'i de otomatik güncelle
    try {
      const trendingCoins = calculateTrendingScores(result.data)
      const trendingCollection = db.collection('trending_data')
      await trendingCollection.replaceOne(
        { _id: 'trending_coins' },
        {
          _id: 'trending_coins',
          coins: trendingCoins,
          updatedAt: new Date(),
          totalCoins: result.data.length,
          processedCoins: trendingCoins.length
        },
        { upsert: true }
      )
      console.log(`✅ [${timeStr}] Trending verisi otomatik güncellendi (${trendingCoins.length} coin)`)
    } catch (trendingError) {
      console.warn(`⚠️ [${timeStr}] Trending güncelleme hatası (devam ediliyor):`, trendingError.message)
    }
    
    return res.json({
      success: true,
      data: result.data,
      apiStatuses: result.apiStatuses || [{ name: 'CoinGecko API', success: true }],
      message: `Crypto list updated: ${result.data.length} coins`
    })
  } catch (error) {
    console.error('❌ POST /api/crypto/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// GET /api/crypto/ohlc/:coinId - CoinGecko API'den OHLC verisi çek
app.get('/api/crypto/ohlc/:coinId', async (req, res) => {
  try {
    const { coinId } = req.params
    const days = parseInt(req.query.days) || 1
    
    if (!coinId) {
      return res.status(400).json({
        success: false,
        error: 'coinId gerekli'
      })
    }
    
    const { fetchOHLCData } = await import('./services/apiHandlers/crypto.js')
    const data = await fetchOHLCData(coinId, days)
    
    return res.json({
      success: true,
      data: data
    })
  } catch (error) {
    console.error('❌ GET /api/crypto/ohlc/:coinId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== TRENDING ENDPOINT ==========
// GET /api/trending - Trending coin verilerini getir
app.get('/api/trending', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('trending_data')
    const trendingDoc = await collection.findOne({ _id: 'trending_coins' })
    
    if (!trendingDoc) {
      return res.json({
        success: true,
        data: {
          coins: [],
          updatedAt: null
        }
      })
    }
    
    return res.json({
      success: true,
      data: {
        coins: trendingDoc.coins || [],
        updatedAt: trendingDoc.updatedAt || trendingDoc.lastUpdate || null
      }
    })
  } catch (error) {
    console.error('❌ GET /api/trending error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/trending/update - Anasayfadaki 500 coin'i kullanarak trending hesapla
app.post('/api/trending/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    // Request body'den anasayfadaki coin listesini al
    const { coins } = req.body

    if (!coins || !Array.isArray(coins) || coins.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Anasayfadaki coin listesi gerekli (coins array)'
      })
    }

    // Anasayfadaki 500 coin üzerinde trending hesaplaması yap
    // Bu coin'ler zaten filtrelenmiş (stablecoinler hariç) ve 500 coin
    const trendingCoins = calculateTrendingScores(coins)

    // MongoDB'ye kaydet
    const collection = db.collection('trending_data')
    await collection.updateOne(
      { _id: 'trending_coins' },
      { 
        $set: {
          coins: trendingCoins,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )

    return res.json({
      success: true,
      data: {
        coins: trendingCoins,
        updatedAt: Date.now()
      },
      message: 'Trending data updated using homepage coins'
    })
  } catch (error) {
    console.error('❌ POST /api/trending/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Trending skorlarını hesapla (Referans algoritmaya göre)
function calculateTrendingScores(coins) {
  if (!coins || coins.length === 0) {
    return []
  }

  return coins
    .map((coin, index) => {
      const priceChange = coin.price_change_percentage_24h || 0
      const volume = coin.total_volume || 0
      const marketCap = coin.market_cap || 0
      const rank = coin.market_cap_rank || index + 1
      
      // ============ TREND SCORE HESAPLAMALARI ============
      
      // 1. Volume/Market Cap Ratio (Likidite Skoru) - %30 ağırlık
      const volumeRatio = marketCap > 0 ? volume / marketCap : 0
      const liquidityScore = Math.min(100, Math.max(0, volumeRatio * 500)) // 0.2 = 100
      
      // 2. Price Momentum (Fiyat Momentumu) - %25 ağırlık
      const momentumScore = Math.min(100, Math.max(0, 50 + (priceChange * 2))) // -25% = 0, +25% = 100
      
      // 3. Market Cap Position (Piyasa Değeri Pozisyonu) - %20 ağırlık
      const marketCapScore = Math.max(0, 100 - (rank * 2)) // Rank 1 = 100, Rank 50 = 0
      
      // 4. Volume Trend (Hacim Trendi) - %15 ağırlık
      const avgVolume = 50000000 // Ortalama hacim benchmark (50M USD)
      const volumeTrendScore = Math.min(100, (volume / avgVolume) * 50)
      
      // 5. Volatility (Volatilite/Oynaklık) - %10 ağırlık
      const volatilityScore = Math.min(100, Math.abs(priceChange) * 5)
      
      // TOPLAM TREND SKORU (Ağırlıklı Ortalama)
      const trendScore = Math.round(
        (liquidityScore * 0.30) +
        (momentumScore * 0.25) +
        (marketCapScore * 0.20) +
        (volumeTrendScore * 0.15) +
        (volatilityScore * 0.10)
      )
      
      // ============ AI TAHMİN MODELİ (24 Saatlik) ============
      
      // 1. Momentum Factor (Fiyat momentumu)
      const momentumFactor = priceChange * 0.6
      
      // 2. Reversion Factor (Geri dönüş faktörü)
      let reversionFactor = 0
      if (priceChange > 10) {
        reversionFactor = -2  // Aşırı yükseliş → düzeltme beklentisi
      } else if (priceChange < -10) {
        reversionFactor = 3  // Aşırı düşüş → toparlanma beklentisi
      }
      
      // 3. Liquidity Impact (Likidite etkisi)
      const liquidityImpact = (volumeRatio > 0.15) ? 1 : -0.5
      
      // 4. Stability Factor (İstikrar faktörü)
      const stabilityFactor = (rank <= 10) ? 0.5 : 0
      
      // AI Prediction
      const aiPrediction = momentumFactor + reversionFactor + liquidityImpact + stabilityFactor
      
      // ============ POZİSYON BELİRLEME ============
      let predictionDirection = 'neutral'
      let predictionEmoji = '➖'
      let predictionColor = 'gray'
      let positionType = 'neutral'
      
      if (aiPrediction > 3) {
        predictionDirection = 'strongBullish'
        predictionEmoji = '🚀'
        predictionColor = 'green'
        positionType = 'long'
      } else if (aiPrediction > 1) {
        predictionDirection = 'bullish'
        predictionEmoji = '📈'
        predictionColor = 'lime'
        positionType = 'long'
      } else if (aiPrediction < -3) {
        predictionDirection = 'strongBearish'
        predictionEmoji = '⚠️'
        predictionColor = 'red'
        positionType = 'short'
      } else if (aiPrediction < -1) {
        predictionDirection = 'bearish'
        predictionEmoji = '📉'
        predictionColor = 'orange'
        positionType = 'short'
      }
      
      // ============ TREND LEVEL ============
      let trendLevel = 'weakTrend'
      let trendEmoji = '📉'
      let trendColor = 'red'
      
      if (trendScore >= 80) {
        trendLevel = 'veryStrongTrend'
        trendEmoji = '🔥'
        trendColor = 'green'
      } else if (trendScore >= 70) {
        trendLevel = 'strongTrend'
        trendEmoji = '📈'
        trendColor = 'lime'
      } else if (trendScore >= 45) {
        trendLevel = 'moderateTrend'
        trendEmoji = '➡️'
        trendColor = 'yellow'
      } else if (trendScore >= 20) {
        trendLevel = 'weakTrend'
        trendEmoji = '📊'
        trendColor = 'orange'
      } else {
        trendLevel = 'veryWeakTrend'
        trendEmoji = '📉'
        trendColor = 'red'
      }
      
      // ============ TAHMİN EDİLEN FİYAT ============
      const predictedPrice = coin.current_price * (1 + (aiPrediction / 100))
      const predictionBasePrice = coin.current_price
      
      // ============ CONFIDENCE SCORE ============
      const confidenceScore = Math.min(100, Math.abs(aiPrediction) * 10)
      
      // ============ SHORT POZİSYON VERİLERİ ============
      const shortSignalStrength = Math.abs(aiPrediction)
      const shortConfidence = priceChange < -5 ? Math.min(100, Math.abs(priceChange) * 3) : 0
      
      // ============ POSITION BONUS (Composite Score için) ============
      const absPrediction = Math.abs(aiPrediction)
      let positionBonus = 0
      if (absPrediction > 3) {
        positionBonus = 40  // Çok güçlü
      } else if (absPrediction > 1) {
        positionBonus = 20  // Güçlü
      } else if (absPrediction > 0) {
        positionBonus = 10  // Normal
      }
      
      const compositeScore = trendScore + positionBonus
      
      return {
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol?.toUpperCase() || '',
        image: coin.image,
        price: coin.current_price,
        current_price: coin.current_price,
        change_24h: priceChange,
        price_change_percentage_24h: priceChange,
        market_cap: marketCap,
        volume_24h: volume,
        total_volume: volume,
        circulating_supply: coin.circulating_supply,
        market_cap_rank: rank,
        sparkline_in_7d: coin.sparkline_in_7d,
        
        // Trend Score ve detayları
        trend_score: trendScore,
        trend_level: trendLevel,
        trend_emoji: trendEmoji,
        trend_color: trendColor,
        liquidity_score: Math.round(liquidityScore),
        momentum_score: Math.round(momentumScore),
        market_cap_score: Math.round(marketCapScore),
        volume_trend_score: Math.round(volumeTrendScore),
        volatility_score: Math.round(volatilityScore),
        volume_ratio: parseFloat(volumeRatio.toFixed(4)),
        volume_ratio_percentage: parseFloat((volumeRatio * 100).toFixed(2)),
        
        // AI Prediction
        ai_prediction: parseFloat(aiPrediction.toFixed(2)),
        ai_direction: predictionDirection,
        ai_emoji: predictionEmoji,
        ai_color: predictionColor,
        ai_confidence: Math.round(confidenceScore),
        position_type: positionType,
        predicted_price: predictedPrice,
        prediction_base_price: predictionBasePrice,
        predicted_change: parseFloat(aiPrediction.toFixed(2)),
        
        // Short pozisyon verileri
        short_signal_strength: Math.round(shortSignalStrength * 10),
        short_confidence: Math.round(shortConfidence),
        
        // Composite score (sıralama için)
        composite_score: compositeScore,
        
        updatedAt: new Date()
      }
    })
    .sort((a, b) => {
      // Önce composite score'a göre sırala
      if (b.composite_score !== a.composite_score) {
        return b.composite_score - a.composite_score
      }
      // Sonra trend score'a göre
      if (b.trend_score !== a.trend_score) {
        return b.trend_score - a.trend_score
      }
      // Son olarak 24 saatlik değişime göre
      return b.change_24h - a.change_24h
    })
    .slice(0, 50) // En iyi 50 coin (referans kodda 45 ama kullanıcı 50 istedi)
}

// ========== NEWS ENDPOINTS ==========
// GET /api/news - MongoDB'den haberleri çek
app.get('/api/news', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        ok: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { limit = 100, orderBy = 'publishedAt', order = 'desc' } = req.query
    const sort = order === 'desc' ? -1 : 1
    const cursor = db.collection('crypto_news')
      .find({})
      .sort({ [orderBy]: sort })
      .limit(parseInt(limit))
    const docs = await cursor.toArray()
    res.json({ ok: true, data: docs })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/news - MongoDB'ye haber ekle
app.post('/api/news', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        ok: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const payload = req.body
    if (Array.isArray(payload)) {
      // Batch insert
      const result = await db.collection('crypto_news').insertMany(payload)
      res.json({ ok: true, insertedCount: result.insertedCount })
    } else {
      // Single insert
      const result = await db.collection('crypto_news').insertOne(payload)
      res.json({ ok: true, insertedId: result.insertedId })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// PUT /api/news/:id - MongoDB'de haberi güncelle
app.put('/api/news/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        ok: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { id } = req.params
    const payload = req.body
    await db.collection('crypto_news').replaceOne({ _id: id }, { _id: id, ...payload }, { upsert: true })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// DELETE /api/news/:id - MongoDB'den haberi sil
app.delete('/api/news/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        ok: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { id } = req.params
    await db.collection('crypto_news').deleteOne({ _id: id })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// POST /api/news/update - Haberleri güncelle (3 kaynaktan paralel çek)
app.post('/api/news/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { updateNews, setDb } = await import('./services/apiHandlers/news.js')
    setDb(db)
    
    const news = await updateNews()
    
    return res.json({
      success: true,
      count: news.length,
      message: `${news.length} haber güncellendi`
    })
  } catch (error) {
    console.error('❌ POST /api/news/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mongodb: db ? 'connected' : 'disconnected' 
  })
})

// Static dosyaları serve et (Heroku için - build edilmiş frontend)
// Bu kod server başlatılmadan önce çalışmalı, bu yüzden aşağıda startServer içinde yapıyoruz

// Server başlat
async function startServer() {
  await connectToMongoDB()
  
  // Static dosyaları serve et (Heroku için - build edilmiş frontend)
  const rootDir = join(__dirname, '..')
  const distDir = join(rootDir, 'dist')
  
  if (existsSync(distDir)) {
    // Production: Static dosyaları serve et
    app.use(express.static(distDir))
    
    // Tüm route'ları index.html'e yönlendir (SPA için)
    // API route'larından sonra ekle (yoksa API route'ları çalışmaz)
    app.get('*', (req, res) => {
      // API route'ları değilse
      if (!req.path.startsWith('/api')) {
        res.sendFile(join(distDir, 'index.html'))
      }
    })
    
    console.log('✅ Static dosyalar serve ediliyor:', distDir)
  } else {
    console.log('⚠️ dist/ klasörü bulunamadı (development mode)')
  }
  
  // HTTP server ve WebSocket server oluştur
  const httpServer = createServer(app)
  
  // WebSocket server - path kontrolü ile
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws' // WebSocket path'i
  })
  
  // WebSocket heartbeat ve bağlantı sınırı
  {
    const MAX_CLIENTS = parseInt(process.env.WS_MAX_CLIENTS || '500', 10)
    const PING_INTERVAL_MS = 30000
    wss.on('connection', (ws, req) => {
      if (wss.clients.size > MAX_CLIENTS) {
        try { ws.close(1013, 'Server is busy') } catch {}
        return
      }
      ws.isAlive = true
      ws.on('pong', () => { ws.isAlive = true })
      console.log(`📡 Yeni WebSocket bağlantısı (toplam: ${wss.clients.size})`)
    })
    const interval = setInterval(() => {
      wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          try { ws.terminate() } catch {}
          return
        }
        ws.isAlive = false
        try { ws.ping() } catch {}
      })
    }, PING_INTERVAL_MS)
    wss.on('close', () => clearInterval(interval))
  }
  
  // Change Streams'i başlat (MongoDB realtime updates için)
  try {
    const { startChangeStreams } = await import('./services/changeStreams.js')
    startChangeStreams(db, wss)
    console.log('✅ Change Streams başlatıldı')
  } catch (error) {
    console.warn('⚠️ Change Streams başlatılamadı:', error.message)
  }
  
  // API Scheduler'ı import et
  const { start } = await import('./services/apiScheduler.js')
  
  httpServer.listen(PORT, () => {
    console.log(`✅ Backend API çalışıyor: http://localhost:${PORT}`)
    console.log(`✅ WebSocket server çalışıyor: ws://localhost:${PORT}/ws`)
    if (process.env.NODE_ENV === 'production') {
      console.log(`✅ Frontend static dosyalar serve ediliyor`)
    }
    
    // API Scheduler'ı başlat
    start()
  })
}

startServer().catch(console.error)

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Server kapatılıyor...')
  if (client) {
    await client.close()
    console.log('✅ MongoDB bağlantısı kapatıldı')
  }
  process.exit(0)
})

