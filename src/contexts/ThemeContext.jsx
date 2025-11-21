import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { loadUserSettings, saveUserSettings } from '../services/mongoUserSettings'

const ThemeContext = createContext(null)

export const ThemeProvider = ({ children }) => {
  // useAuth() null döndürebilir (AuthProvider henüz yüklenmemiş olabilir)
  const authContext = useAuth()
  const user = authContext?.user || null
  
  // localStorage'dan tema yükle - ANINDA (F5 sonrası hemen uygula)
  const getInitialTheme = () => {
    if (typeof window === 'undefined') return 'light'
    const saved = localStorage.getItem('theme')
    return saved || 'light'
  }

  const [theme, setTheme] = useState(getInitialTheme)
  const [isDark, setIsDark] = useState(() => getInitialTheme() === 'dark')
  const [isInitialized, setIsInitialized] = useState(false)

  // İlk yüklemede localStorage'dan temayı DOM'a ANINDA uygula (F5 sonrası)
  useEffect(() => {
    const initialTheme = getInitialTheme()
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(initialTheme)
    setIsInitialized(true)
  }, []) // Sadece mount'ta çalış

  // MongoDB'den tema yükle (kullanıcı giriş yapmışsa) - ARKA PLANDA
  useEffect(() => {
    if (!user) {
      // Kullanıcı giriş yapmamışsa localStorage'dan yükle (zaten yüklendi)
      setIsInitialized(true)
      return
    }

    // MongoDB'den veri çek (arka planda, localStorage'ı override etmez)
    const loadTheme = async () => {
      try {
        const result = await loadUserSettings(user.uid)
        if (result.success && result.settings && result.settings.display?.theme) {
          const themeValue = result.settings.display.theme
          // MongoDB'den gelen tema farklıysa güncelle
          if (themeValue !== theme) {
            setTheme(themeValue)
            setIsDark(themeValue === 'dark')
            localStorage.setItem('theme', themeValue)
            const root = window.document.documentElement
            root.classList.remove('light', 'dark')
            root.classList.add(themeValue)
          }
        }
      } catch (error) {
        console.error('Error loading theme from MongoDB:', error)
        // Hata durumunda localStorage'daki değeri koru
      }
    }

    loadTheme()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]) // Sadece user değiştiğinde çalış (theme dependency'si sonsuz döngüye neden olur)

  // Tema değişikliklerini DOM'a uygula ve localStorage + MongoDB'ye kaydet
  useEffect(() => {
    if (!isInitialized) return
    
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    setIsDark(theme === 'dark')
    localStorage.setItem('theme', theme) // Her zaman localStorage'a kaydet
    
    // MongoDB'ye kaydet (kullanıcı giriş yapmışsa) - ARKA PLANDA
    if (user) {
      const saveTheme = async () => {
        try {
          const result = await loadUserSettings(user.uid)
          const currentSettings = result.success && result.settings ? result.settings : {}
          
          await saveUserSettings(user.uid, {
            ...currentSettings,
            display: {
              ...(currentSettings.display || {}),
              theme: theme
            }
          })
        } catch (error) {
          console.error('Error saving theme to MongoDB:', error)
          // Hata durumunda localStorage'daki değer korunuyor
        }
      }
      saveTheme()
    }
  }, [theme, isInitialized, user])

  // MongoDB'den gelen theme değişikliklerini dinle
  useEffect(() => {
    const handleThemeChange = (event) => {
      const newTheme = event.detail
      setTheme(newTheme)
      setIsDark(newTheme === 'dark')
    }
    
    window.addEventListener('themeChanged', handleThemeChange)
    return () => window.removeEventListener('themeChanged', handleThemeChange)
  }, [])

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark'
    setTheme(newTheme)
    setIsDark(!isDark)
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, theme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}


