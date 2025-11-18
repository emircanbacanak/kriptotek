import React, { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import { loadUserSettings, saveUserSettings } from '../services/mongoUserSettings'

const ThemeContext = createContext(null)

export const ThemeProvider = ({ children }) => {
  // useAuth() null döndürebilir (AuthProvider henüz yüklenmemiş olabilir)
  const authContext = useAuth()
  const user = authContext?.user || null
  
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved === 'dark' || (saved !== 'light' && false) // Default light
  })
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme')
    return saved || 'light'
  })
  const [isInitialized, setIsInitialized] = useState(false)

  // MongoDB'den tema yükle (kullanıcı giriş yapmışsa)
  useEffect(() => {
    const loadTheme = async () => {
      if (!user) {
        // Kullanıcı giriş yapmamışsa localStorage'dan yükle
        const savedTheme = localStorage.getItem('theme')
        const themeValue = savedTheme || 'light'
        setTheme(themeValue)
        setIsDark(themeValue === 'dark')
        setIsInitialized(true)
        return
      }

      try {
        const result = await loadUserSettings(user.uid)
        if (result.success && result.settings && result.settings.display?.theme) {
          const themeValue = result.settings.display.theme
          setTheme(themeValue)
          setIsDark(themeValue === 'dark')
        } else {
          // MongoDB'de ayar yoksa, localStorage'dan yükle
          const savedTheme = localStorage.getItem('theme')
          const themeValue = savedTheme || 'light'
          setTheme(themeValue)
          setIsDark(themeValue === 'dark')
        }
      } catch (error) {
        console.error('Error loading theme:', error)
        const savedTheme = localStorage.getItem('theme')
        const themeValue = savedTheme || 'light'
        setTheme(themeValue)
        setIsDark(themeValue === 'dark')
      } finally {
        setIsInitialized(true)
      }
    }

    loadTheme()
  }, [user])

  // Tema değişikliklerini DOM'a uygula ve MongoDB'ye kaydet
  useEffect(() => {
    if (!isInitialized) return
    
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
    
    // MongoDB'ye kaydet (kullanıcı giriş yapmışsa)
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
          console.error('Error saving theme:', error)
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


