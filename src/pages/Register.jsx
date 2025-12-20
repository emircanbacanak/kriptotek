import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { updatePageSEO } from '../utils/seoMetaTags'
// User settings MongoDB'den okunacak, Register'da otomatik oluşturulmayacak

const Register = () => {
  const { registerWithEmailPassword, loginWithGoogleAuth, isAuthenticated } = useAuth()
  const { t, language, changeLanguage } = useLanguage()

  // Bu sayfa sadece dark tema kullanır
  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light')
    root.classList.add('dark')
    return () => {
      // Sayfa kapanırken temayı geri yükle (isteğe bağlı)
    }
  }, [])

  useEffect(() => {
    updatePageSEO('register', language)
  }, [language])

  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showEmailVerification, setShowEmailVerification] = useState(false)
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: ''
  })

  const containerRef = useRef(null)
  const [draggedElement, setDraggedElement] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const lastClickTimeRef = useRef(0)
  const lastClickElementRef = useRef(null)

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError('')
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [error])

  const handleDoubleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()

    // Drag'ı iptal et
    if (draggedElement) {
      setDraggedElement(null)
      const element = document.getElementById(draggedElement)
      if (element) {
        element.style.cursor = 'grab'
        element.style.zIndex = '2'
      }
    }

    // Tıklama zamanını sıfırla
    lastClickTimeRef.current = 0
    lastClickElementRef.current = null
  }

  const handleDragStart = (e, elementId) => {
    e.preventDefault()
    e.stopPropagation()

    // Çift tıklamayı engelle - son tıklama zamanını kontrol et
    const now = Date.now()
    const timeSinceLastClick = now - lastClickTimeRef.current
    const isSameElement = lastClickElementRef.current === elementId

    if (isSameElement && timeSinceLastClick < 500) {
      // Çift tıklama algılandı, engelle
      lastClickTimeRef.current = 0
      lastClickElementRef.current = null
      e.stopImmediatePropagation()
      return false
    }

    // Tıklama zamanını kaydet
    lastClickTimeRef.current = now
    lastClickElementRef.current = elementId

    const element = document.getElementById(elementId)
    if (!element) return

    const rect = element.getBoundingClientRect()
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    // Mevcut pozisyonu al
    let currentX = rect.left - containerRect.left
    let currentY = rect.top - containerRect.top

    // Eğer left/top varsa onu kullan
    if (element.style.left) {
      currentX = parseFloat(element.style.left) || currentX
    }
    if (element.style.top) {
      currentY = parseFloat(element.style.top) || currentY
    }

    // Fare pozisyonu element içindeki offset
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    setDraggedElement(elementId)
    setDragOffset({ x: offsetX, y: offsetY })

    // Başlangıç pozisyonunu kaydet
    element.dataset.startX = currentX.toString()
    element.dataset.startY = currentY.toString()

    // Stil ayarları
    element.style.cursor = 'grabbing'
    element.style.zIndex = '1000'
    element.style.transition = 'none'
    element.style.animation = 'none'
    element.style.transform = 'none'
    element.style.bottom = ''
    element.style.right = ''
  }

  const handleDragMove = (e) => {
    if (!draggedElement) return

    const element = document.getElementById(draggedElement)
    if (!element) return

    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    // Fare pozisyonunu container'a göre hesapla
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top

    // Yeni pozisyon = fare pozisyonu - offset
    let newX = mouseX - dragOffset.x
    let newY = mouseY - dragOffset.y

    // Sınırları kontrol et
    const elementWidth = element.offsetWidth || 50
    const elementHeight = element.offsetHeight || 50
    const maxX = containerRect.width - elementWidth
    const maxY = containerRect.height - elementHeight
    newX = Math.max(0, Math.min(newX, maxX))
    newY = Math.max(0, Math.min(newY, maxY))

    // Direkt left/top kullan
    element.style.left = `${newX}px`
    element.style.top = `${newY}px`
  }

  const handleDragEnd = () => {
    if (!draggedElement) return

    const element = document.getElementById(draggedElement)
    if (!element) return

    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const rect = element.getBoundingClientRect()

    // Mevcut pozisyonu al
    let finalX = rect.left - containerRect.left
    let finalY = rect.top - containerRect.top

    // Sınırları kontrol et
    const elementWidth = element.offsetWidth || 50
    const elementHeight = element.offsetHeight || 50
    const maxX = containerRect.width - elementWidth
    const maxY = containerRect.height - elementHeight
    finalX = Math.max(0, Math.min(finalX, maxX))
    finalY = Math.max(0, Math.min(finalY, maxY))

    // Smooth transition ile final pozisyona git
    element.style.transition = 'left 0.3s ease-out, top 0.3s ease-out'
    element.style.animation = ''
    element.style.left = `${finalX}px`
    element.style.top = `${finalY}px`
    element.style.cursor = 'grab'
    element.style.zIndex = '2'

    // Dataset'i temizle
    delete element.dataset.startX
    delete element.dataset.startY

    setDraggedElement(null)
  }

  useEffect(() => {
    let rafId = null
    let lastTime = 0
    const throttleMs = 8 // ~120fps için throttle

    const handleMouseMove = (e) => {
      if (draggedElement) {
        e.preventDefault()

        const now = performance.now()
        if (now - lastTime < throttleMs) {
          // Throttle yap, çok sık çağrılmasın
          if (rafId) {
            cancelAnimationFrame(rafId)
          }
          rafId = requestAnimationFrame(() => {
            lastTime = performance.now()
            handleDragMove(e)
          })
        } else {
          lastTime = now
          handleDragMove(e)
        }
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('mousemove', handleMouseMove, { passive: false })
      container.addEventListener('mouseup', handleDragEnd, { passive: true })

      return () => {
        container.removeEventListener('mousemove', handleMouseMove)
        container.removeEventListener('mouseup', handleDragEnd)
        if (rafId) {
          cancelAnimationFrame(rafId)
        }
      }
    }
  }, [draggedElement, dragOffset])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.email || !formData.password || !formData.confirmPassword) {
      setError(t('allFieldsRequired') || 'Tüm alanlar doldurulmalıdır')
      return
    }

    let displayName = formData.displayName
    if (!displayName && formData.email) {
      const emailLocalPart = formData.email.split('@')[0]
      if (emailLocalPart && emailLocalPart.length >= 2) {
        displayName = emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1).toLowerCase()
      }
    }

    if (!displayName || displayName.length < 2 || displayName.length > 50) {
      setError(t('displayNameLengthError') || 'İsim 2-50 karakter arasında olmalıdır')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError(t('validEmailError'))
      return
    }

    if (formData.password.length < 8) {
      setError(t('passwordLengthError') || 'Şifre en az 8 karakter olmalıdır')
      return
    }

    const hasUpperCase = /[A-Z]/.test(formData.password)
    const hasLowerCase = /[a-z]/.test(formData.password)
    const hasNumber = /[0-9]/.test(formData.password)

    if (!hasUpperCase || !hasLowerCase || !hasNumber) {
      setError(t('passwordStrengthError') || 'Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError(t('passwordsNotMatch') || 'Şifreler eşleşmiyor. Lütfen tekrar kontrol edin.')
      return
    }

    setLoading(true)
    const finalDisplayName = formData.displayName || (formData.email ? formData.email.split('@')[0] : '')
    const result = await registerWithEmailPassword(
      formData.email,
      formData.password,
      finalDisplayName
    )

    // User settings MongoDB'den okunacak, Register'da otomatik oluşturulmayacak
    // MongoDB'de manuel olarak oluşturulmalı (premium/admin durumları için)
    if (result.success && result.user) {
      // Settings MongoDB'den yüklenecek (AuthContext'te)
    }

    setLoading(false)

    if (!result.success) {
      // Firebase auth.js'den gelen Türkçe hata mesajını göster
      setError(result.error || t('registerError') || 'Kayıt olurken bir hata oluştu.')
    } else {
      navigate('/login')
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    const result = await loginWithGoogleAuth()
    if (!result.success) {
      // Popup kullanıcı tarafından kapatıldıysa hata gösterme (normal davranış)
      if (result.cancelled || result.code === 'auth/popup-closed-by-user') {
        return
      }
      // Firebase auth.js'den gelen Türkçe hata mesajını göster
      setError(result.error || t('googleLoginError') || 'Google ile kayıt olurken bir hata oluştu.')
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  useEffect(() => {
    if (formData.email && !formData.displayName) {
      const emailLocalPart = formData.email.split('@')[0]
      if (emailLocalPart && emailLocalPart.length >= 2) {
        const dn = emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1).toLowerCase()
        setFormData((prev) => ({
          ...prev,
          displayName: dn
        }))
      }
    }
  }, [formData.email])

  return (
    <main
      ref={containerRef}
      className="min-h-screen animated-login-bg flex items-start sm:items-center justify-center py-16 sm:py-4 px-4 sm:px-6 lg:px-8 relative select-none"
      role="main"
    >
      <div id="coin-1" className="crypto-coin draggable-element" style={{ top: '10%', left: '8%', color: '#ffa726', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-1')} onDoubleClick={handleDoubleClick}>₿</div>
      <div id="coin-2" className="crypto-coin draggable-element" style={{ top: '25%', right: '12%', color: '#7c8eff', animationDelay: '-3s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-2')} onDoubleClick={handleDoubleClick}>Ξ</div>
      <div id="coin-3" className="crypto-coin draggable-element" style={{ bottom: '35%', left: '15%', color: '#4ade80', animationDelay: '-6s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-3')} onDoubleClick={handleDoubleClick}>₮</div>
      <div id="coin-4" className="crypto-coin draggable-element" style={{ bottom: '15%', right: '20%', color: '#fcd34d', animationDelay: '-9s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-4')} onDoubleClick={handleDoubleClick}>🅱</div>
      <div id="coin-5" className="crypto-coin draggable-element" style={{ top: '60%', left: '5%', color: '#3b82f6', animationDelay: '-12s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-5')} onDoubleClick={handleDoubleClick}>◎</div>
      <div id="coin-6" className="crypto-coin draggable-element" style={{ top: '40%', right: '8%', color: '#34d399', animationDelay: '-2s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-6')} onDoubleClick={handleDoubleClick}>Ł</div>
      <div id="coin-7" className="crypto-coin draggable-element" style={{ top: '35%', left: '25%', color: '#ffa726', animationDelay: '-4s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-7')} onDoubleClick={handleDoubleClick}>₿</div>
      <div id="coin-8" className="crypto-coin draggable-element" style={{ top: '70%', right: '30%', color: '#7c8eff', animationDelay: '-7s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-8')} onDoubleClick={handleDoubleClick}>Ξ</div>
      <div id="coin-9" className="crypto-coin draggable-element" style={{ bottom: '50%', left: '40%', color: '#4ade80', animationDelay: '-10s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-9')} onDoubleClick={handleDoubleClick}>₮</div>
      <div id="coin-10" className="crypto-coin draggable-element" style={{ top: '80%', left: '15%', color: '#60a5fa', animationDelay: '-13s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-10')} onDoubleClick={handleDoubleClick}>Ð</div>

      <div id="ticker-1" className="price-ticker green draggable-element" style={{ top: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-1')} onDoubleClick={handleDoubleClick}>BTC +5.2% $98450</div>
      <div id="ticker-2" className="price-ticker red draggable-element" style={{ top: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-2')} onDoubleClick={handleDoubleClick}>ETH -2.1% $3245</div>
      <div id="ticker-3" className="price-ticker green draggable-element" style={{ top: '35%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-3')} onDoubleClick={handleDoubleClick}>BNB +3.8% $645</div>
      <div id="ticker-4" className="price-ticker green draggable-element" style={{ top: '60%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-4')} onDoubleClick={handleDoubleClick}>SOL +7.4% $178</div>
      <div id="ticker-5" className="price-ticker red draggable-element" style={{ top: '35%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-5')} onDoubleClick={handleDoubleClick}>XRP -1.5% $0.85</div>
      <div id="ticker-6" className="price-ticker green draggable-element" style={{ top: '60%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-6')} onDoubleClick={handleDoubleClick}>ADA +4.3% $1.12</div>
      <div id="ticker-7" className="price-ticker red draggable-element" style={{ bottom: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-7')} onDoubleClick={handleDoubleClick}>DOGE -3.2% $0.18</div>
      <div id="ticker-8" className="price-ticker green draggable-element" style={{ bottom: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-8')} onDoubleClick={handleDoubleClick}>MATIC +6.1% $1.5</div>

      <div className="candlestick green" style={{ left: '8%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick red" style={{ left: '12%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ left: '16%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '8%', top: '20%', zIndex: 2 }} />
      <div className="candlestick red" style={{ right: '12%', top: '20%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '16%', top: '20%', zIndex: 2 }} />

      <div className="absolute top-4 right-4 sm:top-6 sm:right-6" style={{ zIndex: 101 }}>
        <label htmlFor="language-selector" className="sr-only">Dil Seçimi</label>
        <select
          id="language-selector"
          name="language"
          aria-label="Dil Seçimi"
          value={language}
          onChange={(e) => changeLanguage(e.target.value)}
          className="bg-slate-800/60 backdrop-blur-sm border border-blue-500/30 rounded-lg px-1 py-1 text-sm text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
        >
          <option value="tr" className="bg-gray-800 text-white">{t('turkish')}</option>
          <option value="en" className="bg-gray-800 text-white">{t('english')}</option>
        </select>
      </div>

      <div className="max-w-[320px] sm:max-w-sm md:max-w-md w-full space-y-2 sm:space-y-4 relative select-text sm:px-0 sm:mt-2" style={{ zIndex: 100 }}>
        <div className="text-center">
          <div className="mx-auto h-12 w-12 sm:h-16 sm:w-16 bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-500/20 animate-pulse transition-opacity duration-300 cursor-pointer">
            <picture>
              <source srcSet="/kriptotek-64.webp 1x, /kriptotek-128.webp 2x" type="image/webp" />
              <img src="/kriptotek.webp" alt="Kriptotek" className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl object-cover" width="64" height="64" />
            </picture>
          </div>
          <h2 className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-white">
            {t('joinKriptotek')} <span className="kriptotek-gradient">Kriptotek</span>
          </h2>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-blue-200 font-medium">
            {t('joinDescription')}
          </p>
        </div>

        <div className="login-form-container p-5 sm:p-8">
          {showEmailVerification && (
            <div className="mb-4 p-4 bg-green-500/20 border border-green-500/50 rounded-lg backdrop-blur-sm">
              {/* Email doğrulama banner placeholder */}
            </div>
          )}

          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="displayName" className="block text-xs sm:text-sm font-medium text-blue-100 mb-1 sm:mb-2">
                {t('fullName')}
              </label>
              <div className="relative">
                <User className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white w-3 h-3" />
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  value={formData.displayName}
                  onChange={handleChange}
                  className="input pl-8 sm:pl-10"
                  placeholder={t('fullNamePlaceholder')}
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-blue-100 mb-1 sm:mb-2">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white w-3 h-3" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="input pl-8 sm:pl-10"
                  placeholder={t('emailPlaceholderRegister')}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-blue-100 mb-1 sm:mb-2">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white w-3 h-3" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleChange}
                  className="input pl-8 sm:pl-10 pr-8 sm:pr-10"
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-200 p-1"
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  title={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-blue-100 mb-1 sm:mb-2">
                {t('passwordRepeat')}
              </label>
              <div className="relative">
                <Lock className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white w-3 h-3" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className="input pl-8 sm:pl-10 pr-8 sm:pr-10"
                  placeholder={t('confirmPasswordPlaceholder')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-200 p-1"
                  aria-label={showConfirmPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                  title={showConfirmPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showConfirmPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 backdrop-blur-sm border border-red-500/50 rounded-lg p-4">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  {t('creatingAccount')}
                </div>
              ) : (
                <>
                  {t('createAccount')}
                  <ArrowRight className="ml-2 w-3 h-3" />
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-blue-500/30" />
              </div>
              <div className="relative flex justify-center text-xs sm:text-sm">
                <span className="px-2 bg-transparent text-blue-200">{t('or')}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full btn btn-outline btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t('registerWithGoogle')}
            </button>

            <div className="text-center text-xs sm:text-sm">
              <span className="text-blue-200/70">
                {t('alreadyHaveAccount')}{' '}
              </span>
              <Link
                to="/login"
                className="login-link-gradient"
              >
                {t('loginHere')}
              </Link>
            </div>
          </form>
        </div>

        <div className="text-center mt-3">
          <p className="text-xs text-blue-200/70">
            {t('accountProblems')}{' '}
            <a
              href="https://t.me/oguz8907"
              target="_blank"
              rel="noopener noreferrer"
              className="login-link-gradient"
              onClick={(e) => e.stopPropagation()}
            >
              {t('contactSupport')}
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}

export default Register


