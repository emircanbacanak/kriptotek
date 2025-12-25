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
  const [isAdmin, setIsAdmin] = useState(() => {
    // localStorage'dan admin durumunu oku (sayfa yenilendiğinde korunması için)
    try {
      const savedAdmin = localStorage.getItem('kriptotek_isAdmin')
      return savedAdmin === 'true'
    } catch {
      return false
    }
  })
  const [isActive, setIsActive] = useState(true) // Varsayılan aktif
  const [userSettings, setUserSettings] = useState(null)
  const settingsPollIntervalRef = useRef(null)
  // Optimistic update yapıldığında timestamp'i sakla (stale data'nın overwrite'ını önlemek için)
  const lastOptimisticUpdateRef = useRef(null)

  // Kullanıcı ayarlarını yükle ve güncelle (sadece MongoDB'den)
  const loadAndUpdateSettings = async (userId) => {
    if (!userId) {
      setUserSettings(null)
      setIsPremium(false)
      setIsAdmin(false)
      setIsActive(true)
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

          // Optimistic update yapıldıysa ve 10 saniye geçmediyse, backend verisini kullanma
          // Bu, admin panelinden yapılan değişikliklerin ezilmesini önler
          if (lastOptimisticUpdateRef.current) {
            const timeSinceOptimisticUpdate = Date.now() - lastOptimisticUpdateRef.current
            if (timeSinceOptimisticUpdate < 30000) { // 30 saniye koruma süresi (artırıldı)
              // Optimistic update hala geçerli, backend verisini ignore et
              return prevIsPremium
            }
            // 30 saniye geçti, artık backend verisini kullan
            lastOptimisticUpdateRef.current = null
          }

          return newIsPremium
        })

        // isActive kontrolü
        setIsActive(prevIsActive => {
          const newIsActive = settings.isActive !== false // Varsayılan true
          if (prevIsActive !== newIsActive) {
            return newIsActive
          }
          return prevIsActive
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

        // Sadece değer değiştiyse ve optimistic update yoksa state'i güncelle
        setIsAdmin(prevIsAdmin => {
          // Optimistic update yapıldıysa ve 30 saniye geçmediyse, backend verisini kullanma
          if (lastOptimisticUpdateRef.current) {
            const timeSinceOptimisticUpdate = Date.now() - lastOptimisticUpdateRef.current
            if (timeSinceOptimisticUpdate < 30000) { // 30 saniye koruma süresi (artırıldı)
              return prevIsAdmin
            }
          }

          // Eğer backend'den admin verisi yoksa (isAdminValue = false) ama localStorage'da true varsa,
          // localStorage değerini koru (dil değişikliği sırasında admin durumu kaybolmasın)
          if (!isAdminValue && prevIsAdmin) {
            try {
              const savedAdmin = localStorage.getItem('kriptotek_isAdmin')
              if (savedAdmin === 'true') {
                // localStorage'da admin durumu var, backend verisi henüz gelmemiş olabilir
                // Mevcut durumu koru
                return prevIsAdmin
              }
            } catch (e) {
              // localStorage hatası - mevcut durumu koru
              return prevIsAdmin
            }
          }

          if (prevIsAdmin !== isAdminValue) {
            // localStorage'a kaydet (dil değişikliğinde korunması için)
            try {
              localStorage.setItem('kriptotek_isAdmin', isAdminValue.toString())
            } catch (e) {
              // localStorage hatası - sessizce geç
            }
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
              setIsActive(settings.isActive !== false)
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
        setIsActive(true) // Varsayılan aktif
      }
    } catch (error) {
      console.warn('⚠️ Kullanıcı ayarları yüklenemedi:', error)
      setUserSettings(null)
      setIsPremium(false)
      setIsAdmin(false)
      setIsActive(true) // Varsayılan aktif
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

        // Real-time güncelleme için polling başlat (her 5 saniyede bir kontrol et)
        settingsPollIntervalRef.current = setInterval(() => {
          // Sessizce güncelle (console log yok, sadece state güncelle)
          loadAndUpdateSettings(firebaseUser.uid).catch(() => {
            // Hata durumunda sessizce devam et
          })
        }, 5000) // 5 saniye
      } else {
        // Kullanıcı yok
        setUserSettings(null)
        setIsPremium(false)
        setIsAdmin(false)
        setIsActive(true)
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

  // Premium durumunu anında güncelle (optimistic update)
  const updatePremiumStatus = (newPremiumStatus) => {
    // Optimistic update timestamp'ini kaydet
    lastOptimisticUpdateRef.current = Date.now()

    // State'i hemen güncelle
    setIsPremium(newPremiumStatus)
    // userSettings'i de güncelle
    setUserSettings(prevSettings => {
      if (prevSettings) {
        return {
          ...prevSettings,
          isPremium: newPremiumStatus,
          updatedAt: Date.now() // Timestamp güncelle ki backend'den gelen eski veri kullanılmasın
        }
      }
      return prevSettings
    })

    // Polling'i geçici olarak durdur (backend response gelene kadar)
    if (settingsPollIntervalRef.current && user) {
      clearInterval(settingsPollIntervalRef.current)
      settingsPollIntervalRef.current = null

      // 15 saniye sonra polling'i tekrar başlat (backend güncellemesi için yeterli süre)
      setTimeout(() => {
        if (user && !settingsPollIntervalRef.current) {
          settingsPollIntervalRef.current = setInterval(() => {
            loadAndUpdateSettings(user.uid).catch(() => {
              // Hata durumunda sessizce devam et
            })
          }, 5000) // 5 saniye
        }
      }, 15000) // 15 saniye bekle (artırıldı)
    }
  }

  // Admin durumunu anında güncelle (optimistic update)
  const updateAdminStatus = (newAdminStatus) => {
    // Optimistic update timestamp'ini kaydet
    lastOptimisticUpdateRef.current = Date.now()

    // State'i hemen güncelle
    setIsAdmin(newAdminStatus)
    // userSettings'i de güncelle
    setUserSettings(prevSettings => {
      if (prevSettings) {
        return {
          ...prevSettings,
          adminEncrypted: newAdminStatus ? prevSettings.adminEncrypted || 'admin=true' : null,
          updatedAt: Date.now() // Timestamp güncelle ki backend'den gelen eski veri kullanılmasın
        }
      }
      return prevSettings
    })

    // Polling'i geçici olarak durdur (backend response gelene kadar)
    if (settingsPollIntervalRef.current && user) {
      clearInterval(settingsPollIntervalRef.current)
      settingsPollIntervalRef.current = null

      // 15 saniye sonra polling'i tekrar başlat (backend güncellemesi için yeterli süre)
      setTimeout(() => {
        if (user && !settingsPollIntervalRef.current) {
          settingsPollIntervalRef.current = setInterval(() => {
            loadAndUpdateSettings(user.uid).catch(() => {
              // Hata durumunda sessizce devam et
            })
          }, 5000) // 5 saniye
        }
      }, 15000) // 15 saniye bekle (artırıldı)
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
    isActive,
    userSettings,
    refreshUserSettings,
    updatePremiumStatus,
    updateAdminStatus,
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
  // Context null ise varsayılan değerler döndür (provider henüz yüklenmemiş olabilir)
  if (!context) {
    return {
      user: null,
      isAuthenticated: false,
      isPremium: false,
      isAdmin: false,
      isActive: true,
      userSettings: null,
      refreshUserSettings: async () => { },
      updatePremiumStatus: () => { },
      updateAdminStatus: () => { },
      loginWithEmailPassword: async () => ({ success: false, error: 'Auth context not available' }),
      loginWithGoogleAuth: async () => ({ success: false, error: 'Auth context not available' }),
      registerWithEmailPassword: async () => ({ success: false, error: 'Auth context not available' }),
      logout: async () => { },
      logoutUser: async () => { },
      updateProfile: async () => ({ success: false, error: 'Auth context not available' }),
      deleteAccount: async () => ({ success: false, error: 'Auth context not available' }),
      refreshUser: async () => ({ success: false, error: 'Auth context not available' })
    }
  }
  return context
}


