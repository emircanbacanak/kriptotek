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
  console.log(`⚠️ Root .env dosyası bulunamadı, varsayılan konum kullanılıyor`)
}

// Debug: FRED_API_KEY kontrolü
if (process.env.FRED_API_KEY) {
} else {
  console.warn(`⚠️ FRED_API_KEY environment variable bulunamadı!`)
  console.warn(`   Kontrol edin: .env dosyasında FRED_API_KEY=... var mı?`)
  console.warn(`   .env dosyası yolu: ${rootEnvPath}`)
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

// Security Headers Middleware - XSS, Clickjacking ve diğer saldırılara karşı koruma
app.use((req, res, next) => {
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block')
  
  // Content Type Options - MIME type sniffing'i engelle
  res.setHeader('X-Content-Type-Options', 'nosniff')
  
  // Frame Options - Clickjacking koruması
  res.setHeader('X-Frame-Options', 'DENY')
  
  // Referrer Policy - Referrer bilgisini kontrol et
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions Policy - Tarayıcı özelliklerini kontrol et
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  
  // Strict Transport Security - HTTPS zorunluluğu (production'da)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  }
  
  // Content Security Policy - XSS ve injection saldırılarına karşı
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.gstatic.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https: blob:; " +
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://localhost:3000 ws://localhost:3000; " +
    "frame-src 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';"
  )
  
  next()
})

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
// Body parser limit'ini artır (500 coin için yeterli olmalı)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Input Validation & Sanitization Middleware
const validateUserId = (userId) => {
  if (!userId || typeof userId !== 'string') {
    return false
  }
  // Firebase UID format kontrolü: alphanumeric + bazı özel karakterler, genellikle 28 karakter
  // Güvenli: Sadece alphanumeric, underscore, dash'e izin ver
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    return false
  }
  // Uzunluk kontrolü (Firebase UID genellikle 28-30 karakter)
  if (userId.length < 10 || userId.length > 128) {
    return false
  }
  return true
}

const sanitizeObject = (obj, maxDepth = 5) => {
  if (maxDepth <= 0) return {}
  if (!obj || typeof obj !== 'object') return {}
  if (Array.isArray(obj)) {
    return obj.slice(0, 100).map(item => sanitizeObject(item, maxDepth - 1))
  }
  
  const sanitized = {}
  for (const [key, value] of Object.entries(obj)) {
    // Key sanitization
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_]/g, '').substring(0, 50)
    if (!sanitizedKey) continue
    
    // Value sanitization
    if (typeof value === 'string') {
      // String length limit
      sanitized[sanitizedKey] = value.substring(0, 10000).trim()
    } else if (typeof value === 'number') {
      // Number validation (prevent NaN, Infinity)
      if (isFinite(value) && !isNaN(value)) {
        sanitized[sanitizedKey] = value
      }
    } else if (typeof value === 'boolean') {
      sanitized[sanitizedKey] = value
    } else if (value === null || value === undefined) {
      sanitized[sanitizedKey] = null
    } else if (typeof value === 'object') {
      sanitized[sanitizedKey] = sanitizeObject(value, maxDepth - 1)
    }
  }
  return sanitized
}

// MongoDB NoSQL Injection Protection - userId validation middleware
app.use('/api/user-settings/:userId', (req, res, next) => {
  const { userId } = req.params
  if (!validateUserId(userId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid user ID format'
    })
  }
  next()
})

app.use('/api/portfolio/:userId', (req, res, next) => {
  const { userId } = req.params
  if (!validateUserId(userId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid user ID format'
    })
  }
  // Sanitize request body for POST/PUT requests
  if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
    req.body = sanitizeObject(req.body)
  }
  next()
})

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || ''
const DB_NAME = process.env.MONGODB_DB_NAME || 'coin-tracking'
const COLLECTION_NAME = 'user_settings'

let db = null
let client = null
let wss = null // WebSocket server

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

// ========== PORTFOLIO ENDPOINTS ==========
// GET /api/portfolio/:userId - Kullanıcının portföyünü getir
app.get('/api/portfolio/:userId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const collection = db.collection('user_portfolio')
    
    const portfolio = await collection.findOne({ userId })
    
    if (!portfolio) {
      return res.json({
        success: true,
        data: {
          userId,
          positions: [],
          totalValue: 0,
          totalProfitLoss: 0,
          totalProfitLossPercent: 0
        }
      })
    }
    
    return res.json({
      success: true,
      data: portfolio
    })
  } catch (error) {
    console.error('❌ GET /api/portfolio/:userId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/portfolio/:userId/positions - Yeni pozisyon ekle
app.post('/api/portfolio/:userId/positions', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId } = req.params
    const position = req.body
    
    const collection = db.collection('user_portfolio')
    
    // Position ID oluştur
    const positionId = position.id || `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Portfolio'yu bul veya oluştur
    const portfolio = await collection.findOne({ userId })
    
    if (!portfolio) {
      // Yeni portfolio oluştur
      await collection.insertOne({
        userId,
        positions: [{
          ...position,
          id: positionId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }],
        updatedAt: Date.now()
      })
    } else {
      // Mevcut portfolio'ya ekle
      await collection.updateOne(
        { userId },
        {
          $push: {
            positions: {
              ...position,
              id: positionId,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          },
          $set: {
            updatedAt: Date.now()
          }
        }
      )
    }
    
    return res.json({
      success: true,
      data: { id: positionId }
    })
  } catch (error) {
    console.error('❌ POST /api/portfolio/:userId/positions error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// PUT /api/portfolio/:userId/positions/:positionId - Pozisyon güncelle
app.put('/api/portfolio/:userId/positions/:positionId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId, positionId } = req.params
    const updates = req.body
    
    const collection = db.collection('user_portfolio')
    
    // Pozisyonu güncelle
    const updateFields = {
      'positions.$.updatedAt': Date.now(),
      updatedAt: Date.now()
    }
    
    Object.keys(updates).forEach(key => {
      updateFields[`positions.$.${key}`] = updates[key]
    })
    
    const result = await collection.updateOne(
      { userId, 'positions.id': positionId },
      {
        $set: updateFields
      }
    )
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Pozisyon bulunamadı'
      })
    }
    
    return res.json({
      success: true,
      data: { id: positionId }
    })
  } catch (error) {
    console.error('❌ PUT /api/portfolio/:userId/positions/:positionId error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// DELETE /api/portfolio/:userId/positions/:positionId - Pozisyon sil
app.delete('/api/portfolio/:userId/positions/:positionId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { userId, positionId } = req.params
    
    const collection = db.collection('user_portfolio')
    
    // Pozisyonu sil
    const result = await collection.updateOne(
      { userId },
      {
        $pull: {
          positions: { id: positionId }
        },
        $set: {
          updatedAt: Date.now()
        }
      }
    )
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Portfolio bulunamadı'
      })
    }
    
    return res.json({
      success: true,
      data: { id: positionId }
    })
  } catch (error) {
    console.error('❌ DELETE /api/portfolio/:userId/positions/:positionId error:', error)
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
      // Debug: MongoDB'den okunurken total_supply ve max_supply kontrolü
      const sampleCoin = cacheDoc.data[0];
      const coinsWithTotalSupply = cacheDoc.data.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
      const coinsWithMaxSupply = cacheDoc.data.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;

      return res.json({
        success: true,
        data: {
          coins: cacheDoc.data, // Her coin'de total_supply, max_supply, circulating_supply var
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

    // CoinMarketCap API'den veri çek (retry mekanizması ile)
    let dominanceData
    try {
      dominanceData = await fetchDominanceData(COINMARKETCAP_API_KEY)
    } catch (error) {
      // API hatası durumunda MongoDB'den mevcut veriyi kullan (fallback)
      console.warn('⚠️ CoinMarketCap API hatası, MongoDB\'den mevcut veri kullanılıyor...')
      const collection = db.collection('api_cache')
      const existing = await collection.findOne({ _id: 'dominance_data' })
      
      if (existing && existing.data) {
        // Mevcut veriyi döndür (güncelleme yapılmadı)
        return res.json({
          success: true,
          data: existing.data,
          message: 'Dominance data retrieved from cache (API unavailable)',
          cached: true
        })
      } else {
        // MongoDB'de de veri yoksa hata döndür
        throw error
      }
    }

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

    // Bugünün snapshot'ını ekle (volume dominance bilgisi de ekle)
    const today = new Date().toISOString().split('T')[0]
    const todayIndex = mergedData.historicalData.findIndex(h => h.date === today)
    const totalVolume24h = dominanceData.global?.total_volume?.usd || 1
    const btcVolume = dominanceData.top3Coins?.[0]?.total_volume || 0
    const ethVolume = dominanceData.top3Coins?.[1]?.total_volume || 0
    const btcVolumeDominance = (btcVolume / totalVolume24h) * 100
    const ethVolumeDominance = (ethVolume / totalVolume24h) * 100
    const snapshot = {
      date: today,
      coin1: dominanceData.dominanceData[0]?.value || 0,
      coin2: dominanceData.dominanceData[1]?.value || 0,
      others: dominanceData.dominanceData[2]?.value || 0,
      btcVolumeDominance: btcVolumeDominance, // BTC volume dominance
      ethVolumeDominance: ethVolumeDominance  // ETH volume dominance
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
        // Debug: Kaydedilmeden önce total_supply ve max_supply kontrolü
        if (result.data.length > 0) {
          const sampleCoin = result.data[0];
          const coinsWithTotalSupply = result.data.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
          const coinsWithMaxSupply = result.data.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;
        }
        
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
        
        // Debug: Kaydedildikten sonra MongoDB'den kontrol
        const savedDoc = await collection.findOne({ _id: 'crypto_list' });
        if (savedDoc && savedDoc.data && savedDoc.data.length > 0) {
          const sampleCoin = savedDoc.data[0];
        }
        
        
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
    const timeStr = new Date().toLocaleTimeString('tr-TR')
    
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
    
    // Debug: Kaydedilmeden önce total_supply ve max_supply kontrolü
    if (result.data && result.data.length > 0) {
      const sampleCoin = result.data[0];
      const coinsWithTotalSupply = result.data.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
      const coinsWithMaxSupply = result.data.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;
    }
    
    await collection.updateOne(
      { _id: 'crypto_list' },
      { 
        $set: {
          data: result.data, // Bu array içinde her coin'de total_supply, max_supply, circulating_supply var
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )
    
    // Debug: Kaydedildikten sonra MongoDB'den kontrol
    const savedDoc = await collection.findOne({ _id: 'crypto_list' });
    if (savedDoc && savedDoc.data && savedDoc.data.length > 0) {
      const sampleCoin = savedDoc.data[0];
      const coinsWithTotalSupply = savedDoc.data.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
      const coinsWithMaxSupply = savedDoc.data.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;
    }
    
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
      
      // ============ TREND SCORE HESAPLAMALARI (500 coin için optimize edildi - çok sıkı) ============
      // NOT: 100/100 = Maksimum performans (en iyi durum), nadiren ulaşılır
      
      // 1. Volume/Market Cap Ratio (Likidite Skoru) - %30 ağırlık
      // Volume ratio: Hacim / Piyasa Değeri oranı
      // Çok sıkı: 1.0+ = 100 (çok nadir, sadece aşırı pump coinlerde)
      // 0.5 = 50, 0.3 = 30, 0.1 = 10
      const volumeRatio = marketCap > 0 ? volume / marketCap : 0
      const liquidityScore = Math.min(100, Math.max(0, volumeRatio * 100))
      
      // 2. Price Momentum (Fiyat Momentumu) - %25 ağırlık
      // 24 saatlik fiyat değişimi
      // Çok sıkı: -60% = 0, +60% = 100 (sadece aşırı hareketler 100 alır)
      // +30% = 50, +15% = 25, 0% = 0
      const momentumScore = Math.min(100, Math.max(0, 50 + (priceChange * (50 / 60))))
      
      // 3. Market Cap Position (Piyasa Değeri Pozisyonu) - %20 ağırlık
      // Piyasa değeri sıralaması (500 coin için - logaritmik ölçek)
      // Rank 1 = 100, Rank 10 = 90, Rank 50 = 70, Rank 100 = 50, Rank 200 = 30, Rank 500 = 0
      let marketCapScore = 0
      if (rank === 1) {
        marketCapScore = 100
      } else if (rank <= 10) {
        // Rank 1-10: 100-90 (linear)
        marketCapScore = 100 - ((rank - 1) * (10 / 9))
      } else if (rank <= 50) {
        // Rank 11-50: 90-70 (logaritmik)
        const normalized = (Math.log10(rank) - Math.log10(10)) / (Math.log10(50) - Math.log10(10))
        marketCapScore = 90 - (normalized * 20)
      } else if (rank <= 100) {
        // Rank 51-100: 70-50 (logaritmik)
        const normalized = (Math.log10(rank) - Math.log10(50)) / (Math.log10(100) - Math.log10(50))
        marketCapScore = 70 - (normalized * 20)
      } else if (rank <= 200) {
        // Rank 101-200: 50-30 (logaritmik)
        const normalized = (Math.log10(rank) - Math.log10(100)) / (Math.log10(200) - Math.log10(100))
        marketCapScore = 50 - (normalized * 20)
      } else if (rank <= 300) {
        // Rank 201-300: 30-15 (logaritmik)
        const normalized = (Math.log10(rank) - Math.log10(200)) / (Math.log10(300) - Math.log10(200))
        marketCapScore = 30 - (normalized * 15)
      } else if (rank <= 400) {
        // Rank 301-400: 15-5 (logaritmik)
        const normalized = (Math.log10(rank) - Math.log10(300)) / (Math.log10(400) - Math.log10(300))
        marketCapScore = 15 - (normalized * 10)
      } else {
        // Rank 401-500: 5-0 (linear)
        marketCapScore = Math.max(0, 5 - ((rank - 400) * (5 / 100)))
      }
      marketCapScore = Math.round(marketCapScore)
      
      // 4. Volume Trend (Hacim Trendi) - %15 ağırlık
      // İşlem hacmi aktivitesi (logaritmik ölçek, çok sıkı)
      // 1M = 0, 50M = 25, 500M = 50, 5B = 75, 50B = 100 (çok nadir)
      const minVolume = 1000000 // 1M USD
      const maxVolume = 50000000000 // 50B USD (çok nadir, sadece top coinler)
      let volumeTrendScore = 0
      if (volume > 0) {
        const logVolume = Math.log10(volume + 1)
        const logMin = Math.log10(minVolume + 1)
        const logMax = Math.log10(maxVolume + 1)
        // Çok sıkı: logaritmik ölçeği daha da sıkıştır
        const normalized = (logVolume - logMin) / (logMax - logMin)
        volumeTrendScore = Math.min(100, Math.max(0, Math.pow(normalized, 0.7) * 100))
      }
      
      // 5. Volatility (Volatilite/Oynaklık) - %10 ağırlık
      // Fiyat volatilitesi (mutlak değişim)
      // Çok sıkı: %60 değişim = 100 skor (sadece aşırı volatilite 100 alır)
      // %30 = 50, %15 = 25, %0 = 0
      const volatilityScore = Math.min(100, Math.abs(priceChange) * (100 / 60))
      
      // TOPLAM TREND SKORU (Ağırlıklı Ortalama)
      const trendScore = Math.round(
        (liquidityScore * 0.30) +
        (momentumScore * 0.25) +
        (marketCapScore * 0.20) +
        (volumeTrendScore * 0.15) +
        (volatilityScore * 0.10)
      )
      
      // ============ GELİŞMİŞ AI TAHMİN MODELİ (24 Saatlik) ============
      
      // 1. Gelişmiş Momentum Factor (Fiyat momentumu - daha hassas)
      // Momentum'u daha doğru hesapla: sadece değişim değil, değişimin hızı da önemli
      let momentumFactor = 0
      if (priceChange > 0) {
        // Pozitif momentum: değişim hızına göre ağırlıklandır
        momentumFactor = Math.min(priceChange * 0.7, priceChange * 0.5 + Math.log(1 + Math.abs(priceChange)) * 0.3)
      } else {
        // Negatif momentum: daha dikkatli
        momentumFactor = priceChange * 0.65
      }
      
      // 2. Gelişmiş Reversion Factor (Geri dönüş faktörü - daha akıllı)
      let reversionFactor = 0
      if (priceChange > 15) {
        reversionFactor = -3.5  // Çok aşırı yükseliş → güçlü düzeltme beklentisi
      } else if (priceChange > 10) {
        reversionFactor = -2.5  // Aşırı yükseliş → düzeltme beklentisi
      } else if (priceChange > 5) {
        reversionFactor = -1  // Orta yükseliş → hafif düzeltme
      } else if (priceChange < -15) {
        reversionFactor = 4  // Çok aşırı düşüş → güçlü toparlanma beklentisi
      } else if (priceChange < -10) {
        reversionFactor = 3  // Aşırı düşüş → toparlanma beklentisi
      } else if (priceChange < -5) {
        reversionFactor = 1.5  // Orta düşüş → hafif toparlanma
      }
      
      // 3. Gelişmiş Liquidity Impact (Likidite etkisi - daha detaylı)
      let liquidityImpact = 0
      if (volumeRatio > 0.25) {
        liquidityImpact = 1.5  // Çok yüksek likidite → güçlü pozitif etki
      } else if (volumeRatio > 0.15) {
        liquidityImpact = 1  // Yüksek likidite → pozitif etki
      } else if (volumeRatio > 0.08) {
        liquidityImpact = 0.3  // Orta likidite → hafif pozitif
      } else if (volumeRatio > 0.03) {
        liquidityImpact = -0.3  // Düşük likidite → hafif negatif
      } else {
        liquidityImpact = -0.8  // Çok düşük likidite → negatif etki
      }
      
      // 4. Gelişmiş Stability Factor (İstikrar faktörü - rank bazlı)
      let stabilityFactor = 0
      if (rank <= 5) {
        stabilityFactor = 0.8  // Top 5 → çok istikrarlı
      } else if (rank <= 10) {
        stabilityFactor = 0.5  // Top 10 → istikrarlı
      } else if (rank <= 20) {
        stabilityFactor = 0.2  // Top 20 → orta istikrar
      } else if (rank <= 50) {
        stabilityFactor = 0  // Top 50 → nötr
      } else {
        stabilityFactor = -0.3  // Alt sıralar → daha az istikrarlı
      }
      
      // 5. Volatility Factor (Volatilite faktörü - yeni)
      const volatilityFactor = Math.abs(priceChange) > 20 ? -0.5 : 0  // Aşırı volatilite → negatif
      
      // 6. Market Cap Factor (Piyasa değeri faktörü - yeni)
      const marketCapFactor = marketCap > 10000000000 ? 0.3 : (marketCap > 1000000000 ? 0.1 : 0)  // Büyük market cap → pozitif
      
      // Gelişmiş AI Prediction (tüm faktörler birleştirilmiş)
      const aiPrediction = momentumFactor + reversionFactor + liquidityImpact + stabilityFactor + volatilityFactor + marketCapFactor
      
      // Tahmin'i sınırla: çok aşırı tahminler yapma
      // NaN veya undefined kontrolü ekle
      const clampedPrediction = isNaN(aiPrediction) || !isFinite(aiPrediction) 
        ? 0 
        : Math.max(-15, Math.min(15, aiPrediction))
      
      // ============ POZİSYON BELİRLEME ============
      // Sınırlanmış tahmin'i kullan
      const finalPrediction = clampedPrediction
      
      let predictionDirection = 'neutral'
      let predictionEmoji = '➖'
      let predictionColor = 'gray'
      let positionType = 'neutral'
      
      if (finalPrediction > 5) {
        predictionDirection = 'strongBullish'
        predictionEmoji = '🚀'
        predictionColor = 'green'
        positionType = 'long'
      } else if (finalPrediction > 2) {
        predictionDirection = 'bullish'
        predictionEmoji = '📈'
        predictionColor = 'lime'
        positionType = 'long'
      } else if (finalPrediction < -5) {
        predictionDirection = 'strongBearish'
        predictionEmoji = '⚠️'
        predictionColor = 'red'
        positionType = 'short'
      } else if (finalPrediction < -2) {
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
      // prediction_base_price: Tahmin yapılırkenki gerçek fiyat (güncel fiyat)
      // Bu fiyat, tahmin yapıldığı anda MongoDB'deki güncel fiyat olmalı
      const predictionBasePrice = coin.current_price || coin.price || 0
      // Sınırlanmış tahmin'i kullan
      const predictedPrice = predictionBasePrice * (1 + (clampedPrediction / 100))
      
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
        
        // AI Prediction (sınırlanmış)
        ai_prediction: parseFloat(clampedPrediction.toFixed(2)),
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

// calculateTrendingScores'u export et (apiScheduler.js için)
export { calculateTrendingScores }

// ========== NEWS ENDPOINTS ==========
// ÖNEMLİ: Spesifik route'lar genel route'lardan ÖNCE tanımlanmalı
// POST /api/news/refresh - Tüm haberleri sil ve yeniden çek (en başta - spesifik route)
app.post('/api/news/refresh', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('crypto_news')
    
    // Tüm haberleri sil
    const deleteResult = await collection.deleteMany({})
    console.log(`🗑️ Tüm haberler silindi: ${deleteResult.deletedCount} haber`)
    
    // Haberleri yeniden çek
    const { updateNews, setDb, setWss } = await import('./services/apiHandlers/news.js')
    setDb(db)
    if (wss) setWss(wss)
    await updateNews()
    
    // Yeni haber sayısını al
    const newCount = await collection.countDocuments()
    
    return res.json({
      success: true,
      message: `Tüm haberler silindi ve yeniden çekildi. ${newCount} yeni haber eklendi.`,
      deletedCount: deleteResult.deletedCount,
      newCount: newCount
    })
  } catch (error) {
    console.error('❌ POST /api/news/refresh error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/news/update - Haberleri güncelle (3 kaynaktan paralel çek) (spesifik route)
app.post('/api/news/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { updateNews, setDb, setWss } = await import('./services/apiHandlers/news.js')
    setDb(db)
    if (wss) setWss(wss)
    
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

// ========== SUPPLY TRACKING ENDPOINT ==========
// GET /cache/supply_tracking - MongoDB'den supply tracking verilerini çek
app.get('/cache/supply_tracking', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'supply_tracking' })
    
    if (cacheDoc && cacheDoc.data) {
      return res.json({
        ok: true,
        success: true,
        data: {
          data: cacheDoc.data,
          lastUpdate: cacheDoc.lastUpdate || cacheDoc.updatedAt || null
        }
      })
    }
    
    return res.status(404).json({
      ok: false,
      success: false,
      error: 'Supply tracking verisi bulunamadı'
    })
  } catch (error) {
    console.error('❌ GET /cache/supply_tracking error:', error)
    return res.status(500).json({
      ok: false,
      success: false,
      error: error.message
    })
  }
})

// ========== SUPPLY HISTORY ENDPOINT ==========
// GET /supply-history/all - Tüm supply snapshot'larını getir (frontend'de filtreleme yapılacak)
app.get('/supply-history/all', async (req, res) => {
  const startTime = Date.now()
  console.log('📥 [Supply History] GET /supply-history/all isteği alındı')
  console.log('📥 [Supply History] Request method:', req.method)
  console.log('📥 [Supply History] Request URL:', req.url)
  
  try {
    if (!db) {
      console.error('❌ [Supply History] MongoDB bağlantısı yok')
      return res.status(503).json({ 
        ok: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const supplyHistoryCollection = db.collection('supply_history')
    
    // Collection'ın var olup olmadığını kontrol et
    const collections = await db.listCollections().toArray()
    const collectionExists = collections.some(c => c.name === 'supply_history')
    console.log(`🔍 [Supply History] Collection var mı? ${collectionExists}`)
    
    if (!collectionExists) {
      console.log('⚠️ [Supply History] supply_history collection bulunamadı, boş array döndürülüyor')
      return res.json({ 
        ok: true, 
        data: [] 
      })
    }
    
    // Collection'daki toplam document sayısını kontrol et
    const totalCount = await supplyHistoryCollection.countDocuments({})
    console.log(`📊 [Supply History] Collection'da toplam ${totalCount} document var`)
    
    console.log('📖 [Supply History] MongoDB\'den mevcut snapshot\'lar okunuyor (yeni veri çekilmiyor)...')
    const queryStartTime = Date.now()
    
    // Sadece gerekli alanları çek (projection) - performans için
    // _id ve supplies alanlarını çek, diğer alanları çekme
    // Limit'i daha da düşür (supplies alanı çok büyük olabilir)
    console.log('⚡ [Supply History] Query optimize edildi: projection + limit 500')
    const queryPromise = supplyHistoryCollection
      .find({}, { 
        projection: { 
          _id: 1, 
          supplies: 1,
          timestamp: 1 
        } 
      })
      .sort({ _id: -1 }) // En yeni önce
      .limit(500) // Son 500 snapshot (daha hızlı - supplies alanı büyük olabilir)
      .toArray()
    
    // 60 saniye timeout ekle (daha büyük veri için)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('MongoDB query timeout (60 saniye)'))
      }, 60000)
    })
    
    let snapshots
    try {
      snapshots = await Promise.race([queryPromise, timeoutPromise])
    } catch (queryError) {
      const queryDuration = Date.now() - queryStartTime
      console.error(`❌ [Supply History] Query hatası (${queryDuration}ms):`, queryError)
      throw queryError
    }
    
    const queryDuration = Date.now() - queryStartTime
    console.log(`✅ [Supply History] ${snapshots.length} mevcut snapshot okundu (${queryDuration}ms) - YENİ VERİ ÇEKİLMEDİ`)
    
    const totalDuration = Date.now() - startTime
    console.log(`✅ [Supply History] Mevcut veriler response olarak gönderiliyor (toplam süre: ${totalDuration}ms)`)
    
    res.json({ 
      ok: true, 
      data: snapshots 
    })
    
    console.log(`✅ [Supply History] Mevcut veriler gönderildi (sadece okuma, veri çekme yok)`)
  } catch (error) {
    const totalDuration = Date.now() - startTime
    console.error('❌ GET /supply-history/all error:', error)
    console.error('❌ Error name:', error.name)
    console.error('❌ Error message:', error.message)
    console.error('❌ Error stack:', error.stack)
    console.error(`❌ Hata süresi: ${totalDuration}ms`)
    
    // Response zaten gönderilmişse tekrar gönderme
    if (!res.headersSent) {
      res.status(500).json({ 
        ok: false, 
        error: error.message || 'Bilinmeyen hata'
      })
      console.log('❌ [Supply History] Error response gönderildi')
    } else {
      console.error('❌ [Supply History] Response zaten gönderilmiş, error response gönderilemedi')
    }
  }
})

// ========== SUPPLY SNAPSHOTS ENDPOINT ==========
// GET /api/supply-snapshots/:coinId - Belirli bir coin için tüm supply snapshot'larını getir
app.get('/api/supply-snapshots/:coinId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { coinId } = req.params
    if (!coinId) {
      return res.status(400).json({
        success: false,
        error: 'coinId parametresi gerekli'
      })
    }

    const supplyHistoryCollection = db.collection('supply_history')
    
    console.log(`🔍 [Supply Snapshots] ${coinId} için snapshot'lar aranıyor...`)
    
    // Collection'ın varlığını kontrol et
    const collections = await db.listCollections().toArray()
    const hasCollection = collections.some(col => col.name === 'supply_history')
    
    if (!hasCollection) {
      console.warn(`⚠️ [Supply Snapshots] supply_history collection bulunamadı`)
      return res.json({
        success: true,
        data: {
          coinId,
          snapshots: [],
          count: 0,
          message: 'supply_history collection bulunamadı - henüz snapshot kaydedilmemiş olabilir'
        }
      })
    }
    
    // Tüm snapshot'ları çek
    let snapshots = []
    try {
      snapshots = await supplyHistoryCollection
        .find({})
        .toArray()
      console.log(`📊 [Supply Snapshots] Toplam ${snapshots.length} snapshot bulundu`)
    } catch (findError) {
      console.error('❌ [Supply Snapshots] MongoDB find hatası:', findError)
      console.error('❌ [Supply Snapshots] Error details:', {
        message: findError.message,
        stack: findError.stack,
        name: findError.name
      })
      throw findError
    }

    // Her snapshot'tan sadece bu coin'e ait veriyi çıkar
    const coinSnapshots = []
    
    for (const snapshot of snapshots) {
      try {
        // supplies objesi var mı kontrol et
        if (!snapshot.supplies || typeof snapshot.supplies !== 'object') {
          continue
        }
        
        // Bu coin'e ait veri var mı kontrol et
        if (snapshot.supplies[coinId] === undefined || snapshot.supplies[coinId] === null) {
          continue
        }
        
        // Timestamp'i kontrol et - yoksa _id'den çıkar
        let timestamp = snapshot.timestamp
        if (!timestamp || typeof timestamp !== 'number') {
          if (snapshot._id) {
            // _id formatından timestamp çıkarmayı dene (YYYY-MM-DD-HHMM formatı)
            const dateStr = snapshot._id.toString()
            // Eğer _id bir tarih string'i ise parse et
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}-\d{4}$/)) {
              const [year, month, day, time] = dateStr.split('-')
              const hour = time.substring(0, 2)
              const minute = time.substring(2, 4)
              const dateObj = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`)
              timestamp = dateObj.getTime()
              if (isNaN(timestamp)) {
                timestamp = Date.now()
              }
            } else {
              // Fallback: şu anki zamanı kullan
              timestamp = Date.now()
            }
          } else {
            timestamp = Date.now()
          }
        }
        
        coinSnapshots.push({
          date: snapshot.date || snapshot._id?.toString() || 'N/A',
          timestamp: timestamp,
          supply: snapshot.supplies[coinId]
        })
      } catch (mapError) {
        console.warn(`⚠️ [Supply Snapshots] Snapshot parse hatası (${snapshot._id}):`, mapError.message)
        continue
      }
    }
    
    // Timestamp'e göre sırala
    coinSnapshots.sort((a, b) => a.timestamp - b.timestamp)
    
    console.log(`✅ [Supply Snapshots] ${coinId} için ${coinSnapshots.length} snapshot bulundu`)

    console.log(`✅ [Supply Snapshots] ${coinId} için ${coinSnapshots.length} snapshot döndürülüyor`)
    
    return res.json({
      success: true,
      data: {
        coinId,
        snapshots: coinSnapshots,
        count: coinSnapshots.length
      }
    })
  } catch (error) {
    console.error('❌ GET /api/supply-snapshots/:coinId error:', error)
    console.error('❌ Error message:', error.message)
    console.error('❌ Error stack:', error.stack)
    return res.status(500).json({
      success: false,
      error: error.message || 'Bilinmeyen hata',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// ========== FED RATE ENDPOINT ==========
// GET /api/fed-rate - MongoDB'den Fed rate verilerini çek
app.get('/api/fed-rate', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const collection = db.collection('api_cache')
    const cacheDoc = await collection.findOne({ _id: 'fed_rate' })
    
    if (cacheDoc && cacheDoc.data) {
      // Cache'de nextDecisionDate varsa kontrol et
      if (cacheDoc.data.nextDecisionDate) {
        const nextDecisionTime = new Date(cacheDoc.data.nextDecisionDate).getTime()
        const now = Date.now()
        const diff = nextDecisionTime - now
        
        // Sonraki karar tarihine kadar cache geçerli
        if (diff > 0) {
          return res.json({
            success: true,
            data: cacheDoc.data,
            lastUpdate: cacheDoc.updatedAt || cacheDoc.lastUpdate || null
          })
        }
      }
      
      // Fallback: 30 dakika içindeki cache'i kabul et (nextDecisionDate null olsa bile)
      const age = Date.now() - (cacheDoc.updatedAt || cacheDoc.lastUpdate || 0)
      if (age < 30 * 60 * 1000) {
        return res.json({
          success: true,
          data: cacheDoc.data,
          lastUpdate: cacheDoc.updatedAt || cacheDoc.lastUpdate || null
        })
      }
    }
    
    // Cache yok veya geçersiz - otomatik güncelleme yap
    try {
      console.log('⚠️ GET /api/fed-rate: Cache yok veya geçersiz, otomatik güncelleme yapılıyor...')
      const { fetchFedRateData } = await import('./services/apiHandlers/fedRate.js')
      const fedRateData = await fetchFedRateData(db)
      
      // MongoDB'ye kaydet
      await collection.updateOne(
        { _id: 'fed_rate' },
        { 
          $set: {
            data: fedRateData,
            updatedAt: Date.now(),
            lastUpdate: Date.now()
          }
        },
        { upsert: true }
      )
      
      return res.json({
        success: true,
        data: fedRateData,
        lastUpdate: Date.now()
      })
    } catch (updateError) {
      console.error('❌ GET /api/fed-rate: Otomatik güncelleme hatası:', updateError)
      return res.status(500).json({
        success: false,
        error: updateError.message || 'Fed rate verisi güncellenemedi'
      })
    }
  } catch (error) {
    console.error('❌ GET /api/fed-rate error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// POST /api/fed-rate/update - Tüm Fed rate verilerini çek ve MongoDB'ye kaydet
app.post('/api/fed-rate/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    // FRED_API_KEY artık gerekli değil - yeni kaynaklar eklenecek
    const { fetchFedRateData } = await import('./services/apiHandlers/fedRate.js')
    const fedRateData = await fetchFedRateData(db)

    // MongoDB'ye kaydet
    const collection = db.collection('api_cache')
    await collection.updateOne(
      { _id: 'fed_rate' },
      { 
        $set: {
          data: fedRateData,
          updatedAt: Date.now(),
          lastUpdate: Date.now()
        }
      },
      { upsert: true }
    )

    const timeStr = new Date().toLocaleTimeString('tr-TR')
    console.log(`✅ [${timeStr}] Fed rate verisi güncellendi`)

    return res.json({
      success: true,
      data: fedRateData,
      message: 'Fed rate data updated'
    })
  } catch (error) {
    console.error('❌ POST /api/fed-rate/update error:', error)
    return res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ========== SUPPLY TRACKING ENDPOINT ==========
// POST /api/supply-tracking/update - Supply tracking verilerini güncelle
app.post('/api/supply-tracking/update', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        error: 'MongoDB bağlantısı yok' 
      })
    }

    const { updateSupplyTracking } = await import('./services/apiHandlers/supplyTracking.js')
    const success = await updateSupplyTracking(db)
    
    if (success) {
      return res.json({
        success: true,
        message: 'Supply tracking data updated'
      })
    } else {
      return res.status(500).json({
        success: false,
        error: 'Supply tracking update failed'
      })
    }
  } catch (error) {
    console.error('❌ POST /api/supply-tracking/update error:', error)
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
    
    // Production'da mesaj gösterme
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ Static dosyalar serve ediliyor:', distDir)
    }
  }
  // Development mode - mesaj gösterme (production'da hiçbir şey yazdırma)
  
  // HTTP server ve WebSocket server oluştur
  const httpServer = createServer(app)
  
  // WebSocket server - path kontrolü ile
  wss = new WebSocketServer({ 
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
  } catch (error) {
    console.warn('⚠️ Change Streams başlatılamadı:', error.message)
  }
  
  // API Scheduler'ı import et
  const { start, setDbInstance } = await import('./services/apiScheduler.js')
  
  // MongoDB db instance'ını scheduler'a geç
  if (db) {
    setDbInstance(db)
  }
  
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

