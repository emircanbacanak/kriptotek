import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import {
  auth
} from '../firebase/firebaseConfig'
import {
  loginWithEmailPassword as fbLoginWithEmailPassword,
  loginWithGoogleAuth as fbLoginWithGoogleAuth,
  registerWithEmailPassword as fbRegisterWithEmailPassword
} from '../firebase/auth'
import { updateUserProfile as firebaseUpdateUserProfile, deleteUserAccount as firebaseDeleteUserAccount } from '../firebase/auth'
import { loadUserSettings, saveUserSettings } from '../services/mongoUserSettings'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isPremium, setIsPremium] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [userSettings, setUserSettings] = useState(null)
  const settingsPollIntervalRef = useRef(null)

  // Kullanıcı ayarlarını yükle ve güncelle (sadece MongoDB'den)
  const loadAndUpdateSettings = async (userId) => {
    if (!userId) {
      setUserSettings(null)
      setIsPremium(false)
      setIsAdmin(false)
      return
    }

    try {
      const result = await loadUserSettings(userId)
      
      // Veri varsa işle (exists kontrolü esnek olsun, sadece settings varsa yeterli)
      if (result.success && result.settings) {
        const settings = result.settings
        
        // State güncellemelerini optimize et (sadece önemli alanlar değiştiyse güncelle)
        setUserSettings(prevSettings => {
          // Önemli alanları kontrol et (isPremium, adminEncrypted, display)
          if (!prevSettings) return settings
          
          const prevImportant = {
            isPremium: prevSettings.isPremium,
            adminEncrypted: prevSettings.adminEncrypted,
            display: prevSettings.display
          }
          const newImportant = {
            isPremium: settings.isPremium,
            adminEncrypted: settings.adminEncrypted,
            display: settings.display
          }
          
          // Önemli alanlar değişmediyse state'i güncelleme (gereksiz render'ı önle)
          if (
            prevImportant.isPremium === newImportant.isPremium &&
            prevImportant.adminEncrypted === newImportant.adminEncrypted &&
            JSON.stringify(prevImportant.display) === JSON.stringify(newImportant.display)
          ) {
            return prevSettings // Aynı referansı döndür (React re-render yapmaz)
          }
          
          return settings
        })
        
        setIsPremium(prevIsPremium => {
          const newIsPremium = settings.isPremium === true || settings.isPremium === 'true'
          if (prevIsPremium !== newIsPremium) {
            return newIsPremium
          }
          return prevIsPremium
        })
        
        // Admin kontrolü (adminEncrypted varsa ve deşifrelenebiliyorsa admin)
        // State güncellemesini optimize etmek için önce mevcut değeri kontrol et
        let isAdminValue = false
        if (settings.adminEncrypted) {
          try {
            // adminEncrypted değerini deşifrele (sync fonksiyon, await gerekmez)
            const { decryptAES } = await import('../utils/advancedSecurity')
            const adminData = decryptAES(settings.adminEncrypted)
            
            // Deşifreleme başarılı ve true ise admin
            if (adminData === true) {
              isAdminValue = true
            } else if (adminData === null || adminData === undefined) {
              // Deşifreleme başarısız ama adminEncrypted var - eski format olabilir
              // Fallback: adminEncrypted varsa ve boş değilse admin kabul et
              // Sessizce fallback yap (console log yok)
              isAdminValue = settings.adminEncrypted && settings.adminEncrypted.trim() !== ''
            }
          } catch (error) {
            // Deşifreleme hatası - fallback kontrolü
            // adminEncrypted değeri varsa ve boş değilse admin kabul et (eski format için)
            isAdminValue = settings.adminEncrypted && settings.adminEncrypted.trim() !== ''
          }
        }
        
        // Sadece değer değiştiyse state'i güncelle (gereksiz render'ları önle)
        setIsAdmin(prevIsAdmin => {
          if (prevIsAdmin !== isAdminValue) {
            return isAdminValue
          }
          return prevIsAdmin
        })
        
        // Display ayarlarını context'lere uygula (event-based, context'ler dinliyor)
        if (settings.display) {
          // Theme context'e uygula
          if (settings.display.theme) {
            localStorage.setItem('theme', settings.display.theme)
            window.dispatchEvent(new CustomEvent('themeChanged', { detail: settings.display.theme }))
          }
          
          // Language context'e uygula
          if (settings.display.language) {
            localStorage.setItem('language', settings.display.language)
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: settings.display.language }))
          }
          
          // Currency context'e uygula
          if (settings.display.currency) {
            localStorage.setItem('currency', settings.display.currency)
            window.dispatchEvent(new CustomEvent('currencyChanged', { detail: settings.display.currency }))
          }
        }
      } else {
        // Ayarlar yok - Google login sonrası veya yeni kullanıcı için varsayılan settings oluştur
        if (result.success && !result.exists && !result.backendUnavailable && user) {
          // Backend çalışıyor ama settings yok - varsayılan oluştur (Google login için)
          console.log('ℹ️ [AuthContext] No settings found, creating default settings for Google user...')
          
          const defaultSettings = {
            email: user.email || null,
            displayName: user.displayName || (user.email ? user.email.split('@')[0] : null),
            photoURL: user.photoURL || null,
            display: {
              currency: localStorage.getItem('currency') || 'USD',
              language: localStorage.getItem('language') || 'tr',
              theme: localStorage.getItem('theme') || 'light'
            },
            isPremium: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          
          // MongoDB'ye kaydet
          const saveResult = await saveUserSettings(userId, defaultSettings)
          if (saveResult.success) {
            console.log('✅ [AuthContext] Default settings created for Google user')
            // Kaydedilen settings'i tekrar yükle
            const reloadResult = await loadUserSettings(userId)
            if (reloadResult.success && reloadResult.settings) {
              const settings = reloadResult.settings
              setUserSettings(settings)
              setIsPremium(settings.isPremium === true || settings.isPremium === 'true')
              setIsAdmin(!!settings.adminEncrypted)
              
              // Display ayarlarını context'lere uygula
              if (settings.display) {
                if (settings.display.theme) {
                  localStorage.setItem('theme', settings.display.theme)
                  window.dispatchEvent(new CustomEvent('themeChanged', { detail: settings.display.theme }))
                }
                if (settings.display.language) {
                  localStorage.setItem('language', settings.display.language)
                  window.dispatchEvent(new CustomEvent('languageChanged', { detail: settings.display.language }))
                }
                if (settings.display.currency) {
                  localStorage.setItem('currency', settings.display.currency)
                  window.dispatchEvent(new CustomEvent('currencyChanged', { detail: settings.display.currency }))
                }
              }
              return // Başarılı, çık
            }
          } else {
            console.warn('⚠️ [AuthContext] Failed to save default settings:', saveResult.error)
          }
        }
        
        // Ayarlar yok veya backend API çalışmıyor
        if (result.backendUnavailable) {
          console.warn('⚠️ [AuthContext] Backend API çalışmıyor! MongoDB\'den veri alınamıyor.')
          console.warn('⚠️ [AuthContext] Backend API\'yi başlatmanız gerekiyor.')
        } else {
          console.log('⚠️ [AuthContext] No settings found, using defaults')
        }
        setUserSettings(null)
        setIsPremium(false)
        setIsAdmin(false)
      }
    } catch (error) {
      console.warn('⚠️ Kullanıcı ayarları yüklenemedi:', error)
      setUserSettings(null)
      setIsPremium(false)
      setIsAdmin(false)
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      
      // Önceki polling'i temizle
      if (settingsPollIntervalRef.current) {
        clearInterval(settingsPollIntervalRef.current)
        settingsPollIntervalRef.current = null
      }
      
      // Kullanıcı ayarlarını MongoDB'den yükle
      if (firebaseUser) {
        await loadAndUpdateSettings(firebaseUser.uid)
        
        // Real-time güncelleme için polling başlat (her 30 saniyede bir kontrol et - sayfa yenilenmesini önlemek için)
        settingsPollIntervalRef.current = setInterval(() => {
          // Sessizce güncelle (console log yok, sadece state güncelle)
          loadAndUpdateSettings(firebaseUser.uid).catch(() => {
            // Hata durumunda sessizce devam et
          })
        }, 30000) // 30 saniye (10 saniyeden 30 saniyeye çıkarıldı)
      } else {
        // Kullanıcı yok
        setUserSettings(null)
        setIsPremium(false)
        setIsAdmin(false)
      }
      
      setLoading(false)
    })
    
    return () => {
      unsubscribe()
      if (settingsPollIntervalRef.current) {
        clearInterval(settingsPollIntervalRef.current)
        settingsPollIntervalRef.current = null
      }
    }
  }, [])

  const loginWithEmailPassword = (email, password) =>
    fbLoginWithEmailPassword(email, password)

  const loginWithGoogleAuth = () => fbLoginWithGoogleAuth()

  const registerWithEmailPassword = (email, password, displayName) =>
    fbRegisterWithEmailPassword(email, password, displayName)

  const logout = async () => {
    await signOut(auth)
  }

  const logoutUser = async () => {
    // Polling'i durdur
    if (settingsPollIntervalRef.current) {
      clearInterval(settingsPollIntervalRef.current)
      settingsPollIntervalRef.current = null
    }
    await logout()
  }

  // Kullanıcı ayarlarını manuel olarak yenile (login sonrası çağrılabilir)
  const refreshUserSettings = async () => {
    if (user) {
      await loadAndUpdateSettings(user.uid)
    }
  }

  // Profil güncelleme
  const updateProfile = async (profileData) => {
    try {
      const result = await firebaseUpdateUserProfile(profileData)
      if (result.success && result.user) {
        setUser(result.user)
      }
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Hesap silme
  const deleteAccount = async (password = null) => {
    try {
      const result = await firebaseDeleteUserAccount(password)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  // Kullanıcı bilgilerini yenile (şifre değişikliği sonrası provider güncelleme için)
  const refreshUser = async () => {
    try {
      const { auth } = await import('../firebase/firebaseConfig')
      const currentUser = auth.currentUser
      
      if (currentUser) {
        await currentUser.reload()
        const refreshedUser = auth.currentUser
        
        const userData = {
          uid: refreshedUser.uid,
          email: refreshedUser.email,
          displayName: refreshedUser.displayName,
          photoURL: refreshedUser.photoURL,
          emailVerified: refreshedUser.emailVerified,
          providerData: refreshedUser.providerData
        }
        
        setUser(userData)
        
        return { success: true, user: userData }
      }
      
      return { success: false, error: 'No authenticated user' }
    } catch (error) {
      console.error('Refresh user error:', error)
      return { success: false, error: error.message }
    }
  }

  const value = {
    user,
    isAuthenticated: !!user,
    isPremium,
    isAdmin,
    userSettings,
    refreshUserSettings,
    loginWithEmailPassword,
    loginWithGoogleAuth,
    registerWithEmailPassword,
    logout,
    logoutUser,
    updateProfile,
    deleteAccount,
    refreshUser
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Yükleniyor...
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  // Context null ise null döndür (hata fırlatma, çünkü provider henüz yüklenmemiş olabilir)
  return context
}


