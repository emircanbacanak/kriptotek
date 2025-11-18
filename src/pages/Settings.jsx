import React, { useState, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { loadUserSettings, saveUserSettings, resetUserSettings } from '../services/mongoUserSettings'
import { changePassword } from '../firebase/auth'
import { Moon, Sun, Save, Check, AlertCircle, Eye, EyeOff, Shield, User, Settings as SettingsIcon } from 'lucide-react'
import globalDataManager from '../managers/globalDataManager'

const Settings = () => {
  const { toggleTheme, isDark } = useTheme()
  const { language, changeLanguage, t } = useLanguage()
  const { user, deleteAccount: firebaseDeleteAccount, updateProfile, refreshUser, refreshUserSettings } = useAuth()
  const { setCurrency } = useCurrency()
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState({ type: '', text: '' })
  const [hasChanges, setHasChanges] = useState(false)
  const [originalSettings, setOriginalSettings] = useState(null)
  
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' })
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false })
  const [passwordErrors, setPasswordErrors] = useState({})
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [passwordChangeMessage, setPasswordChangeMessage] = useState({ type: '', text: '' })
  const [currentRates, setCurrentRates] = useState({})
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [showDeletePassword, setShowDeletePassword] = useState(false)
  const [isGoogleUser, setIsGoogleUser] = useState(false)
  const [hasPasswordProvider, setHasPasswordProvider] = useState(false)
  
  const [profileData, setProfileData] = useState({ displayName: '' })
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  
  const defaultSettings = {
    display: {
      currency: 'USD',
      language: 'tr',
      theme: 'light'
    }
  }

  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    const loadSettings = async () => {
      if (!user) {
        setSettings(defaultSettings)
        setOriginalSettings(defaultSettings)
        return
      }

      try {
        const result = await loadUserSettings(user.uid)
        if (result.success && result.settings && result.settings.display) {
          const loadedSettings = {
            display: {
              currency: result.settings.display.currency || 'USD',
              language: result.settings.display.language || 'tr',
              theme: result.settings.display.theme || (isDark ? 'dark' : 'light')
            },
            isPremium: result.settings.isPremium || false
          }
          setSettings(loadedSettings)
          setOriginalSettings(loadedSettings)
          setProfileData({ displayName: result.settings.displayName || user.displayName || '' })
        } else {
          const newDefaultSettings = {
            display: { currency: 'USD', language: 'tr', theme: 'light' },
            isPremium: false,
            adminEncrypted: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          await saveUserSettings(user.uid, newDefaultSettings)
          setSettings(newDefaultSettings)
          setOriginalSettings(newDefaultSettings)
          setProfileData({ displayName: user.displayName || '' })
        }
      } catch (error) {
        console.error('Error loading settings:', error)
        setSettings(defaultSettings)
        setOriginalSettings(defaultSettings)
      }

      // Döviz kurlarını globalDataManager'dan yükle
      const globalData = globalDataManager.getData()
      if (globalData.currencyRates) {
        setCurrentRates(globalData.currencyRates)
      }
      
      if (user) {
        setProfileData({ displayName: user.displayName || '' })
        
        const checkProviders = async () => {
          try {
            const { auth } = await import('../firebase/firebaseConfig')
            const currentUser = auth.currentUser
            
            if (currentUser) {
              await currentUser.reload()
              const refreshedUser = auth.currentUser
              
              const hasGoogleProvider = refreshedUser.providerData?.some(provider => provider.providerId === 'google.com')
              const hasPassword = refreshedUser.providerData?.some(provider => provider.providerId === 'password')
              const isGoogleOnly = hasGoogleProvider && !hasPassword
              
              setIsGoogleUser(isGoogleOnly)
              setHasPasswordProvider(hasPassword)
            }
          } catch (error) {
            console.error('Provider check error:', error)
            const hasGoogleProvider = user.providerData?.some(provider => provider.providerId === 'google.com')
            const hasPassword = user.providerData?.some(provider => provider.providerId === 'password')
            const isGoogleOnly = hasGoogleProvider && !hasPassword
            setIsGoogleUser(isGoogleOnly)
            setHasPasswordProvider(hasPassword)
          }
        }
        
        checkProviders()
      }
    }

    loadSettings()
  }, [user, isDark])

  // GlobalDataManager'dan currency rates'i dinle
  useEffect(() => {
    // Mevcut veriyi al
    const globalData = globalDataManager.getData()
    if (globalData.currencyRates) {
      setCurrentRates(globalData.currencyRates)
    }

    // Değişiklikleri dinle
    const unsubscribe = globalDataManager.subscribe((data) => {
      if (data.currencyRates) {
        setCurrentRates(data.currencyRates)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (originalSettings) {
      const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings)
      setHasChanges(changed)
    }
  }, [settings, originalSettings])

  const handleSettingChange = (category, key, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: { ...prev[category], [key]: value }
    }))
    setSaveMessage({ type: '', text: '' })
  }

  const handleSave = async () => {
    if (!user) {
      setSaveMessage({ type: 'error', text: t('loginRequiredToSave') })
      return
    }

    setIsSaving(true)
    setSaveMessage({ type: '', text: '' })

    try {
      const result = await saveUserSettings(user.uid, settings)
      if (result.success) {
        if (settings.display.language !== language) changeLanguage(settings.display.language)
        if (settings.display.currency) {
          setCurrency(settings.display.currency)
          window.dispatchEvent(new CustomEvent('currencyChanged', { detail: settings.display.currency }))
        }
        if (settings.display.theme !== (isDark ? 'dark' : 'light')) {
          if (settings.display.theme === 'dark' && !isDark) toggleTheme()
          if (settings.display.theme === 'light' && isDark) toggleTheme()
          window.dispatchEvent(new CustomEvent('themeChanged', { detail: settings.display.theme }))
        }
        setOriginalSettings(settings)
        setSaveMessage({ type: 'success', text: t('saveSuccess') })
        setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000)
        // AuthContext'i güncelle
        if (refreshUserSettings) {
          await refreshUserSettings()
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('saveError') })
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!user) {
      setSaveMessage({ type: 'error', text: t('loginRequiredToReset') })
      return
    }

    setIsSaving(true)
    setSaveMessage({ type: '', text: '' })

    try {
      const result = await resetUserSettings(user.uid)
      if (result.success) {
        setSettings(defaultSettings)
        setOriginalSettings(defaultSettings)
        if (isDark) toggleTheme()
        if (language !== 'tr') changeLanguage('tr')
        setCurrency('USD')
        window.dispatchEvent(new CustomEvent('currencyChanged', { detail: 'USD' }))
        setSaveMessage({ type: 'success', text: t('settingsReset') })
        setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000)
        // AuthContext'i güncelle
        if (refreshUserSettings) {
          await refreshUserSettings()
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('saveError') })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteAccount = () => setShowDeleteModal(true)

  const confirmDeleteAccount = async () => {
    setIsDeletingAccount(true)
    setSaveMessage({ type: '', text: '' })
    try {
      const hasPasswordProvider = user?.providerData?.some(p => p.providerId === 'password')
      const result = await firebaseDeleteAccount(hasPasswordProvider ? deletePassword : null)
      if (result.success) {
        setSaveMessage({ type: 'success', text: t('accountDeletedSuccessfully') })
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else {
        setSaveMessage({ type: 'error', text: result.error || t('accountDeletionError') })
        setShowDeleteModal(false)
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: t('accountDeletionError') })
      setShowDeleteModal(false)
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const cancelDeleteAccount = () => {
    setShowDeleteModal(false)
    setDeletePassword('')
    setShowDeletePassword(false)
  }

  const handleProfileUpdate = async (e) => {
    e.preventDefault()
    setIsUpdatingProfile(true)
    setSaveMessage({ type: '', text: '' })
    try {
      if (!profileData.displayName || profileData.displayName.trim().length < 2 || profileData.displayName.trim().length > 50) {
        setSaveMessage({ type: 'error', text: t('displayNameLengthError') })
        setIsUpdatingProfile(false)
        return
      }
      
      const result = await updateProfile({ displayName: profileData.displayName.trim() })
      if (result.success) {
        const settingsResult = await loadUserSettings(user.uid)
        if (settingsResult.success) {
          const currentSettings = settingsResult.settings || {}
          await saveUserSettings(user.uid, {
            ...currentSettings,
            displayName: profileData.displayName.trim(),
            email: currentSettings.email || user.email || null,
            photoURL: currentSettings.photoURL || user.photoURL || null
          })
        }
        
        setSaveMessage({ type: 'success', text: t('profileUpdateSuccess') })
        setTimeout(() => setSaveMessage({ type: '', text: '' }), 3000)
        if (refreshUser) {
          await refreshUser()
        }
      } else {
        setSaveMessage({ type: 'error', text: result.error || t('profileUpdateError') })
      }
    } catch (error) {
      console.error('Profile update error:', error)
      setSaveMessage({ type: 'error', text: t('profileUpdateError') })
    } finally {
      setIsUpdatingProfile(false)
    }
  }

  const handleProfileChange = (field, value) => {
    setProfileData(prev => ({ ...prev, [field]: value }))
  }

  const calculatePasswordStrength = (password) => {
    let score = 0
    const checks = {
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    }
    Object.values(checks).forEach(check => { if (check) score++ })
    if (score < 3) return { level: 'weak', score, checks }
    if (score < 4) return { level: 'medium', score, checks }
    if (score < 5) return { level: 'strong', score, checks }
    return { level: 'veryStrong', score, checks }
  }

  const passwordStrength = calculatePasswordStrength(passwords.new)

  const validatePasswords = () => {
    const errors = {}
    
    if (hasPasswordProvider && !passwords.current) {
      errors.current = t('currentPasswordRequired')
    }
    
    if (!passwords.new) {
      errors.new = t('newPasswordRequired')
    }
    
    if (passwords.new && passwordStrength.level === 'weak') {
      errors.new = t('passwordTooWeak')
    }
    
    if (passwords.new && passwords.confirm && passwords.new !== passwords.confirm) {
      errors.confirm = t('passwordsNotMatch')
    }
    
    if (hasPasswordProvider && passwords.current && passwords.new && passwords.current === passwords.new) {
      errors.new = t('newPasswordMustBeDifferent')
    }
    
    setPasswordErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handlePasswordChange = (field, value) => {
    setPasswords(prev => ({ ...prev, [field]: value }))
    if (passwordErrors[field]) setPasswordErrors(prev => ({ ...prev, [field]: '' }))
    if (passwordChangeMessage.text) {
      setPasswordChangeMessage({ type: '', text: '' })
    }
  }

  const handleChangePassword = async () => {
    if (!validatePasswords()) {
      if (passwordErrors.current) {
        setSaveMessage({ type: 'error', text: passwordErrors.current })
      } else if (passwordErrors.new) {
        setSaveMessage({ type: 'error', text: passwordErrors.new })
      } else if (passwordErrors.confirm) {
        setSaveMessage({ type: 'error', text: passwordErrors.confirm })
      }
      return
    }
    
    if (hasPasswordProvider && passwords.current && passwords.new && passwords.current === passwords.new) {
      setSaveMessage({ type: 'error', text: t('newPasswordMustBeDifferent') })
      return
    }
    
    setIsChangingPassword(true)
    setSaveMessage({ type: '', text: '' })
    
    try {
      if (hasPasswordProvider && (!passwords.current || passwords.current.trim() === '')) {
        setSaveMessage({ type: 'error', text: t('currentPasswordRequired') })
        setIsChangingPassword(false)
        return
      }
      
      const translations = {
        wrongCurrentPassword: t('wrongCurrentPassword'),
        passwordChanged: t('passwordChanged')
      }
      const result = await changePassword(passwords.current || null, passwords.new, translations)
      
      if (!result.success) {
        let errorMessage = result.error
        if (!errorMessage || errorMessage === undefined || errorMessage === '') {
          errorMessage = t('wrongCurrentPassword')
        }
        setPasswordChangeMessage({ type: 'error', text: errorMessage })
        setIsChangingPassword(false)
        return
      }
      const refreshResult = await refreshUser()
      if (refreshResult.success && refreshResult.user) {
        const hasPassword = refreshResult.user.providerData.some(p => p.providerId === 'password')
        const hasGoogleProvider = refreshResult.user.providerData.some(p => p.providerId === 'google.com')
        const newIsGoogleOnly = hasGoogleProvider && !hasPassword
        setIsGoogleUser(newIsGoogleOnly)
        setHasPasswordProvider(hasPassword)
      }
      setPasswords({ current: '', new: '', confirm: '' })
      setPasswordErrors({})
      setPasswordChangeMessage({ type: 'success', text: result.message || t('passwordChanged') })
      setTimeout(() => setPasswordChangeMessage({ type: '', text: '' }), 3000)
    } catch (error) {
      console.error('Password change error:', error)
      setPasswordChangeMessage({ type: 'error', text: t('saveError') })
    } finally {
      setIsChangingPassword(false)
    }
  }

  const togglePasswordVisibility = (field) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const showSaveMessage = () => {
    if (!saveMessage.text) return null
    return (
      <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
        saveMessage.type === 'success' 
          ? 'bg-green-100 text-green-800 border border-green-200 dark:bg-green-900 dark:text-green-200' 
          : 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-900 dark:text-red-200'
      }`}>
        {saveMessage.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
        <span className="font-medium">{saveMessage.text}</span>
      </div>
    )
  }

  const getStrengthColor = (level) => {
    switch (level) {
      case 'weak': return 'bg-red-500'
      case 'medium': return 'bg-yellow-500'
      case 'strong': return 'bg-blue-500'
      case 'veryStrong': return 'bg-green-500'
      default: return 'bg-gray-300'
    }
  }

  const getStrengthText = (level) => {
    switch (level) {
      case 'weak': return t('weak')
      case 'medium': return t('medium')
      case 'strong': return t('strong')
      case 'veryStrong': return t('veryStrong')
      default: return ''
    }
  }

  const headerIconGradient = isDark 
    ? 'from-blue-600 to-indigo-600'
    : 'from-blue-500 to-indigo-500'
  
  const headerTextGradient = isDark
    ? 'from-blue-400 to-indigo-400'
    : 'from-blue-600 to-indigo-600'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30 space-y-6 animate-fade-in p-4 sm:p-6">
      {showSaveMessage()}
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110`}>
            <SettingsIcon className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
              {t('settingsTitle')}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 hidden sm:block">
              {t('settingsDescription')}
            </p>
            {hasChanges && (
              <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-1 flex items-center animate-slide-in">
                <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                {t('unsavedChanges')}
              </p>
            )}
          </div>
        </div>
        <div className="flex space-x-3 mt-4 sm:mt-0">
          <button
            type="button"
            onClick={handleReset}
            disabled={isSaving}
            className="group relative overflow-hidden bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl px-4 py-2 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 flex items-center space-x-2"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
            <Save className={`w-4 h-4 relative z-10 ${isSaving ? 'animate-pulse' : ''}`} />
            <span className="relative z-10 font-medium">{t('resetSettings')}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white rounded-xl px-4 py-2 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center space-x-2"
          >
            <Save className={`w-4 h-4 relative z-10 ${isSaving ? 'animate-pulse' : ''}`} />
            <span className="relative z-10 font-medium">{isSaving ? t('saving') : t('save')}</span>
          </button>
        </div>
      </div>

      {/* Profile Info Card */}
      <div className="group relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {t('profileInfo')}
            </h2>
          </div>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('fullName')}
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={profileData.displayName}
                onChange={(e) => handleProfileChange('displayName', e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t('fullNamePlaceholder')}
                required
                disabled={isUpdatingProfile}
              />
            </div>
          </div>
          
          <button
            type="submit"
            disabled={isUpdatingProfile || !profileData.displayName.trim()}
            className="group relative overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white rounded-xl px-4 py-2.5 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 w-full font-medium"
          >
            {isUpdatingProfile ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>{t('updatingProfile')}</span>
              </div>
            ) : (
              t('updateProfile')
            )}
          </button>
        </form>
        </div>
      </div>

      {/* Display and Password Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Display Card */}
        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
          <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
          <div className="flex items-center space-x-3 mb-6">
            {isDark ? <Moon className="w-5 h-5 text-primary-600" /> : <Sun className="w-5 h-5 text-primary-600" />}
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
              {t('display')}
            </h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{t('theme')}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('themeDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newTheme = isDark ? 'light' : 'dark'
                  handleSettingChange('display', 'theme', newTheme)
                  toggleTheme()
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center space-x-2"
              >
                {isDark ? ( <> <Sun className="w-4 h-4" /> <span>{t('light')}</span> </> ) : ( <> <Moon className="w-4 h-4" /> <span>{t('dark')}</span> </> )}
              </button>
            </div>

            <div>
              <div className="mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('currency')}</label>
              </div>
              <select
                value={settings.display.currency}
                onChange={(e) => handleSettingChange('display', 'currency', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">{t('usd')}</option>
                <option value="EUR">{t('eur')}</option>
                <option value="TRY">{t('try')}</option>
              </select>
              
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('currentRates')}:</h4>
                <div className="flex gap-6 sm:gap-36 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-400">EUR:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {currentRates.EUR && currentRates.TRY 
                        ? `₺${(currentRates.TRY / currentRates.EUR).toFixed(2)}` 
                        : t('loading')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600 dark:text-gray-400">USD:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {currentRates.TRY 
                        ? `₺${currentRates.TRY.toFixed(2)}` 
                        : t('loading')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('language')}</label>
              <select
                value={settings.display.language}
                onChange={(e) => handleSettingChange('display', 'language', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="tr">{t('turkish')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </div>
          </div>
          </div>
        </div>

        {/* Password Card */}
        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
          <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">{t('passwordChange')}</h2>
          </div>
          
          <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-4">
            <input 
              type="text" 
              name="username" 
              autoComplete="username" 
              value={user?.email || ''}
              readOnly
              style={{ display: 'none' }} 
              tabIndex={-1}
              aria-hidden="true"
            />
            
            {hasPasswordProvider && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('currentPassword')}</label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwords.current}
                    onChange={(e) => handlePasswordChange('current', e.target.value)}
                    className={`w-full px-4 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${passwordErrors.current ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                    placeholder={t('enterCurrentPassword')}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => togglePasswordVisibility('current')} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {passwordErrors.current && <p className="text-red-500 text-sm mt-1">{passwordErrors.current}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('newPassword')}</label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwords.new}
                  onChange={(e) => handlePasswordChange('new', e.target.value)}
                  className={`w-full px-4 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${passwordErrors.new ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder={t('enterNewPassword')}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => togglePasswordVisibility('new')} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordErrors.new && <p className="text-red-500 text-sm mt-1">{passwordErrors.new}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('confirmNewPassword')}</label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={(e) => handlePasswordChange('confirm', e.target.value)}
                  className={`w-full px-4 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${passwordErrors.confirm ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
                  placeholder={t('confirmNewPassword')}
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => togglePasswordVisibility('confirm')} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordErrors.confirm && <p className="text-red-500 text-sm mt-1">{passwordErrors.confirm}</p>}
            </div>

            {/* Password Change Message */}
            {passwordChangeMessage.text && (
              <div className={`p-3 rounded-lg flex items-center space-x-2 ${
                passwordChangeMessage.type === 'success' 
                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-700' 
                  : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700'
              }`}>
                {passwordChangeMessage.type === 'success' ? (
                  <Check className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                )}
                <span className="font-medium text-sm">{passwordChangeMessage.text}</span>
              </div>
            )}

            {passwords.new && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{t('passwordStrength')}</span>
                  <span className={`font-medium ${
                    passwordStrength.level === 'weak' ? 'text-red-600' :
                    passwordStrength.level === 'medium' ? 'text-yellow-600' :
                    passwordStrength.level === 'strong' ? 'text-blue-600' : 'text-green-600'
                  }`}>{getStrengthText(passwordStrength.level)}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${getStrengthColor(passwordStrength.level)}`}
                    style={{ width: `${(passwordStrength.score / 5) * 100}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <div className={`flex items-center ${passwordStrength.checks.length ? 'text-green-600' : ''}`}>
                    <span className="mr-1">{passwordStrength.checks.length ? '✓' : '○'}</span>{t('minLength')}
                  </div>
                  <div className={`flex items-center ${passwordStrength.checks.uppercase ? 'text-green-600' : ''}`}>
                    <span className="mr-1">{passwordStrength.checks.uppercase ? '✓' : '○'}</span>{t('hasUppercase')}
                  </div>
                  <div className={`flex items-center ${passwordStrength.checks.lowercase ? 'text-green-600' : ''}`}>
                    <span className="mr-1">{passwordStrength.checks.lowercase ? '✓' : '○'}</span>{t('hasLowercase')}
                  </div>
                  <div className={`flex items-center ${passwordStrength.checks.number ? 'text-green-600' : ''}`}>
                    <span className="mr-1">{passwordStrength.checks.number ? '✓' : '○'}</span>{t('hasNumber')}
                  </div>
                  <div className={`flex items-center ${passwordStrength.checks.special ? 'text-green-600' : ''}`}>
                    <span className="mr-1">{passwordStrength.checks.special ? '✓' : '○'}</span>{t('hasSpecialChar')}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isChangingPassword || passwordStrength.level === 'weak' || (hasPasswordProvider && !passwords.current) || !passwords.new || !passwords.confirm}
              className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-500 dark:to-purple-500 text-white rounded-xl px-4 py-2.5 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 w-full font-medium"
            >
              {isChangingPassword ? (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4 animate-pulse" />
                  <span>{t('changingPassword')}</span>
                </div>
              ) : (isGoogleUser ? t('setPassword') : t('changePassword'))}
            </button>
          </form>
          </div>
        </div>
      </div>

      {/* Settings Summary Card */}
      <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">{t('settingsSummary')}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          <div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">{t('currency')}</p>
            <p className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 dark:text-white">{settings.display.currency}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">{t('languageLabel')}</p>
            <p className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900 dark:text-white">
              {settings.display.language === 'tr' ? t('turkish') : t('english')}
            </p>
          </div>
        </div>
      </div>

      {/* Account Deletion Card */}
      <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border-2 border-red-200 dark:border-red-800 shadow-lg">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">{t('accountDeletion')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('deleteAccountPermanently')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="group relative w-full bg-gradient-to-r from-red-600 to-red-700 text-white rounded-xl px-4 py-2.5 shadow-lg transform transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 flex items-center justify-center gap-2 font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {t('deleteMyAccount')}
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 transform transition-all duration-300 scale-100">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('confirmAccountDeletion')}</h3>
              </div>
              
              <div className="mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{t('accountDeletionWarning')}</p>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">{t('dataToBeDeleted')}:</h4>
                  <ul className="text-xs text-red-700 dark:text-red-300 space-y-1">
                    <li>• {t('personalInformation')}</li>
                    <li>• {t('favoriteCryptoList')}</li>
                    <li>• {t('accountSettings')}</li>
                    <li>• {t('allCacheData')}</li>
                  </ul>
                </div>
              </div>
              
              <form onSubmit={(e) => { e.preventDefault(); confirmDeleteAccount(); }} className="space-y-4">
                <input 
                  type="text" 
                  name="username" 
                  autoComplete="username" 
                  value={user?.email || ''}
                  readOnly
                  style={{ display: 'none' }} 
                  tabIndex={-1}
                  aria-hidden="true"
                />
                
                {user?.providerData?.some(p => p.providerId === 'password') && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('enterCurrentPassword')}</label>
                    <div className="relative">
                      <input
                        type={showDeletePassword ? 'text' : 'password'}
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
                        placeholder={t('enterCurrentPassword')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                        disabled={isDeletingAccount}
                        autoComplete="current-password"
                      />
                    <button
                      type="button"
                      onClick={() => setShowDeletePassword(!showDeletePassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      disabled={isDeletingAccount}
                    >
                      {showDeletePassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('accountDeletionPasswordNote')}</p>
                </div>
              )}
              
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={cancelDeleteAccount}
                    disabled={isDeletingAccount}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingAccount || (!user?.photoURL?.includes('googleusercontent.com') && !deletePassword.trim())}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                  >
                  {isDeletingAccount ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      {t('deleting')}...
                    </div>
                  ) : (
                    t('yesDeleteAccount')
                  )}
                </button>
              </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings

