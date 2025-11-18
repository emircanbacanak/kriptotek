import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, ArrowRight, Shield } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { updatePageSEO } from '../utils/seoMetaTags'
import useCryptoDataForLogin from '../hooks/useCryptoDataForLogin'
import {
  bruteForceProtection,
  updateLastActivity
} from '../utils/security'
import {
  generateMathCaptcha,
  verifyCaptcha
} from '../utils/advancedSecurity'

const Login = () => {
  const { isDark } = useTheme()
  const { loginWithEmailPassword, loginWithGoogleAuth, isAuthenticated, refreshUserSettings } = useAuth()
  const { t, language, changeLanguage } = useLanguage()

  useEffect(() => {
    updatePageSEO('login', language)
  }, [language])

  // Merkezi veri yönetim sisteminden veri al
  const { cryptoData, tickerData } = useCryptoDataForLogin()

  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [formLoadTime] = useState(Date.now())
  const [captcha, setCaptcha] = useState(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [showCaptcha, setShowCaptcha] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)

  const containerRef = useRef(null)
  const [draggedElement, setDraggedElement] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (failedAttempts >= 3 && !showCaptcha) {
      const newCaptcha = generateMathCaptcha()
      setCaptcha(newCaptcha)
      setShowCaptcha(true)
    }
  }, [failedAttempts, showCaptcha])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  const handleDragStart = useCallback((e, elementId) => {
    e.preventDefault()
    const element = e.target
    const rect = element.getBoundingClientRect()

    setDraggedElement(elementId)
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })

    element.style.cursor = 'grabbing'
    element.style.zIndex = '1000'
  }, [])

  const handleDragMove = useCallback((e) => {
    if (!draggedElement) return

    const element = document.getElementById(draggedElement)
    if (!element) return

    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    const newX = e.clientX - containerRect.left - dragOffset.x
    const newY = e.clientY - containerRect.top - dragOffset.y

    element.style.transform = `translate(${newX}px, ${newY}px)`
    element.style.left = '0'
    element.style.top = '0'
    element.style.right = 'auto'
    element.style.bottom = 'auto'
  }, [draggedElement, dragOffset])

  const handleDragEnd = useCallback(() => {
    if (!draggedElement) return

    const element = document.getElementById(draggedElement)
    if (element) {
      const transform = element.style.transform
      if (transform) {
        const match = transform.match(/translate\((-?\d+\.?\d*)px,\s*(-?\d+\.?\d*)px\)/)
        if (match) {
          const x = parseFloat(match[1])
          const y = parseFloat(match[2])
          element.style.left = `${x}px`
          element.style.top = `${y}px`
          element.style.transform = ''
        }
      }

      element.style.cursor = 'grab'
      element.style.zIndex = '2'
    }

    setDraggedElement(null)
  }, [draggedElement])

  useEffect(() => {
    if (!draggedElement) return

    let rafId = null

    const handleMouseMove = (e) => {
      e.preventDefault()

      if (rafId) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        handleDragMove(e)
      })
    }

    const container = containerRef.current
    if (!container) return

    container.addEventListener('mousemove', handleMouseMove, { passive: false })
    container.addEventListener('mouseup', handleDragEnd, { passive: true })

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseup', handleDragEnd)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [draggedElement, handleDragMove, handleDragEnd])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.email || !formData.password) {
      setError(t('emailAndPasswordRequired'))
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError(t('validEmailError'))
      return
    }

    if (formData.password.length < 6) {
      setError(t('passwordMinLength'))
      return
    }

    const bruteForceCheck = bruteForceProtection.isBlocked(formData.email)
    if (bruteForceCheck.blocked) {
      setError(t('loginBlockedForSecurity', { seconds: bruteForceCheck.remainingTime }) || 'Güvenlik nedeniyle giriş geçici olarak engellendi.')
      return
    }

    if (showCaptcha && captcha) {
      if (!captchaAnswer) {
        setError(t('captchaRequired') || 'Lütfen güvenlik sorusunu cevaplayın.')
        return
      }

      if (!verifyCaptcha(parseInt(captchaAnswer, 10), captcha.hash)) {
        const result = bruteForceProtection.recordFailedAttempt(formData.email)
        setFailedAttempts((prev) => prev + 1)

        const newCaptcha = generateMathCaptcha()
        setCaptcha(newCaptcha)
        setCaptchaAnswer('')

        if (result.blocked) {
          setError(t('tooManyFailedAttempts', { seconds: result.remainingTime }) || 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.')
        } else if (result.attemptsLeft && result.attemptsLeft <= 2) {
          setError(t('captchaIncorrectAttemptsLeft', { attempts: result.attemptsLeft }) || 'CAPTCHA hatalı, tekrar deneyin.')
        } else {
          setError(t('captchaIncorrect') || 'CAPTCHA cevabı hatalı.')
        }

        return
      }
    }

    setLoading(true)
    const result = await loginWithEmailPassword(formData.email, formData.password)
    setLoading(false)

    if (!result.success) {
      setFailedAttempts((prev) => prev + 1)
      bruteForceProtection.recordFailedAttempt(formData.email)

      let errorMessage = result.error || t('loginErrorOccurred')

      if (errorMessage.includes('auth/invalid-credential')) {
        errorMessage = t('invalidCredential')
      }

      setError(errorMessage)

      if (failedAttempts >= 2 && !showCaptcha) {
        setShowCaptcha(true)
        const newCaptcha = generateMathCaptcha()
        setCaptcha(newCaptcha)
      }

      const isInvalidCredentialError = result.error?.includes('auth/invalid-credential') ||
        errorMessage === t('invalidCredential')

      if (isInvalidCredentialError) {
        setTimeout(() => {
          setError('')
        }, 5000)
      }
    } else {
      bruteForceProtection.clearAttempts(formData.email)
      updateLastActivity()
      setFailedAttempts(0)
      setShowCaptcha(false)
      setCaptchaAnswer('')
      
      // Giriş başarılı - MongoDB'den kullanıcı ayarlarını yükle
      // onAuthStateChanged zaten tetiklenecek ama manuel de yükleyelim
      setTimeout(async () => {
        await refreshUserSettings()
      }, 500) // Firebase auth state güncellenmesi için kısa bir bekleme
    }
  }

  const handleGoogleLogin = async () => {
    setError('')
    const result = await loginWithGoogleAuth()
    if (!result.success) {
      if (result.error && (result.error.includes(t('popupClosedByUser')) || result.error.includes('Login cancelled'))) {
        return
      }
      setError(result.error || t('googleLoginError') || 'Google ile giriş yapılırken bir hata oluştu.')
    } else {
      // Google girişi başarılı - MongoDB'den kullanıcı ayarlarını yükle
      setTimeout(async () => {
        await refreshUserSettings()
      }, 500) // Firebase auth state güncellenmesi için kısa bir bekleme
    }
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen animated-login-bg flex items-start sm:items-center justify-center py-16 sm:py-4 px-4 sm:px-6 lg:px-8 relative select-none"
    >
      <div key="coin-1" id="coin-1" className="crypto-coin draggable-element" style={{ top: '10%', left: '8%', color: '#ffa726', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-1')}>₿</div>
      <div key="coin-2" id="coin-2" className="crypto-coin draggable-element" style={{ top: '25%', right: '12%', color: '#7c8eff', animationDelay: '-3s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-2')}>Ξ</div>
      <div key="coin-3" id="coin-3" className="crypto-coin draggable-element" style={{ bottom: '35%', left: '15%', color: '#4ade80', animationDelay: '-6s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-3')}>₮</div>
      <div key="coin-4" id="coin-4" className="crypto-coin draggable-element" style={{ bottom: '15%', right: '20%', color: '#fcd34d', animationDelay: '-9s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-4')}>🅱</div>
      <div key="coin-5" id="coin-5" className="crypto-coin draggable-element" style={{ top: '60%', left: '5%', color: '#3b82f6', animationDelay: '-12s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-5')}>◎</div>
      <div key="coin-6" id="coin-6" className="crypto-coin draggable-element" style={{ top: '40%', right: '8%', color: '#34d399', animationDelay: '-2s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-6')}>Ł</div>
      <div key="coin-7" id="coin-7" className="crypto-coin draggable-element" style={{ top: '35%', left: '25%', color: '#ffa726', animationDelay: '-4s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-7')}>₿</div>
      <div key="coin-8" id="coin-8" className="crypto-coin draggable-element" style={{ top: '70%', right: '30%', color: '#7c8eff', animationDelay: '-7s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-8')}>Ξ</div>
      <div key="coin-9" id="coin-9" className="crypto-coin draggable-element" style={{ bottom: '50%', left: '40%', color: '#4ade80', animationDelay: '-10s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-9')}>₮</div>
      <div key="coin-10" id="coin-10" className="crypto-coin draggable-element" style={{ top: '80%', left: '15%', color: '#60a5fa', animationDelay: '-13s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-10')}>Ð</div>

      <div key="ticker-1" id="ticker-1" className={`price-ticker ${tickerData[0]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-1')}>
        {tickerData[0] ? `${tickerData[0].symbol} ${tickerData[0].change} ${tickerData[0].price}` : 'BTC +5.2% $98450'}
      </div>
      <div key="ticker-2" id="ticker-2" className={`price-ticker ${tickerData[1]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-2')}>
        {tickerData[1] ? `${tickerData[1].symbol} ${tickerData[1].change} ${tickerData[1].price}` : 'ETH -2.1% $3245'}
      </div>
      <div key="ticker-3" id="ticker-3" className={`price-ticker ${tickerData[2]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '35%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-3')}>
        {tickerData[2] ? `${tickerData[2].symbol} ${tickerData[2].change} ${tickerData[2].price}` : 'BNB +3.8% $645'}
      </div>
      <div key="ticker-4" id="ticker-4" className={`price-ticker ${tickerData[3]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '60%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-4')}>
        {tickerData[3] ? `${tickerData[3].symbol} ${tickerData[3].change} ${tickerData[3].price}` : 'SOL +7.4% $178'}
      </div>
      <div key="ticker-5" id="ticker-5" className={`price-ticker ${tickerData[4]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '35%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-5')}>
        {tickerData[4] ? `${tickerData[4].symbol} ${tickerData[4].change} ${tickerData[4].price}` : 'XRP -1.5% $0.85'}
      </div>
      <div key="ticker-6" id="ticker-6" className={`price-ticker ${tickerData[5]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ top: '60%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-6')}>
        {tickerData[5] ? `${tickerData[5].symbol} ${tickerData[5].change} ${tickerData[5].price}` : 'ADA +4.3% $1.12'}
      </div>
      <div key="ticker-7" id="ticker-7" className={`price-ticker ${tickerData[6]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ bottom: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-7')}>
        {tickerData[6] ? `${tickerData[6].symbol} ${tickerData[6].change} ${tickerData[6].price}` : 'DOGE -3.2% $0.18'}
      </div>
      <div key="ticker-8" id="ticker-8" className={`price-ticker ${tickerData[7]?.isPositive ? 'green' : 'red'} draggable-element`} style={{ bottom: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-8')}>
        {tickerData[7] ? `${tickerData[7].symbol} ${tickerData[7].change} ${tickerData[7].price}` : 'MATIC +6.1% $1.5'}
      </div>

      <div className="candlestick green" style={{ left: '8%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick red" style={{ left: '12%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ left: '16%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '8%', top: '20%', zIndex: 2 }} />
      <div className="candlestick red" style={{ right: '12%', top: '20%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '16%', top: '20%', zIndex: 2 }} />

      <div className="absolute top-4 right-4 sm:top-6 sm:right-6" style={{ zIndex: 101 }}>
        <select
          id="language-selector"
          name="language"
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
          <div className="mx-auto h-12 w-12 sm:h-16 sm:w-16 bg-gradient-to-br from-blue-500 via-green-500 to-yellow-500 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-500/20 animate-pulse hover:scale-110 transition-transform duration-300 cursor-pointer">
            <img src="/kriptotek.jpg" alt="Kriptotek" className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl object-cover" />
          </div>
          <h2 className="mt-3 sm:mt-4 text-xl sm:text-3xl font-bold text-white">
            {t('welcome')} <span className="kriptotek-gradient">Kriptotek</span>
          </h2>
        </div>

        <div className="login-form-container p-5 sm:p-8">
          <form className="space-y-4 sm:space-y-6" onSubmit={handleSubmit}>
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
                  className="input pl-8 pr-8 sm:pl-10 sm:pr-10"
                  placeholder={t('passwordPlaceholder')}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-200"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
              </div>
            </div>

            {showCaptcha && captcha && (
              <div key={captcha.hash} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <div className="flex items-center mb-3">
                  <Shield className="w-5 h-5 text-yellow-400 mr-2" />
                  <h4 className="text-sm font-semibold text-yellow-200">{t('securityVerification') || 'Güvenlik Doğrulaması'}</h4>
                </div>
                <p className="text-xs text-blue-200 mb-2">
                  {t('verifyNotBot') || 'Lütfen robot olmadığınızı doğrulayın.'}
                </p>
                <div className="mb-2">
                  <label className="block text-sm font-medium text-blue-100 mb-1">
                    {captcha.question}
                  </label>
                  <input
                    key={`captcha-input-${captcha.hash}`}
                    type="number"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    className="input w-full"
                    placeholder={t('yourAnswer')}
                    autoFocus
                    required
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between text-xs sm:text-sm">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-blue-100">
                  {t('rememberMe')}
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="login-link-gradient"
              >
                {t('forgotPassword')}
              </Link>
            </div>

            {error && (
              <div className="bg-red-900/30 backdrop-blur-sm border border-red-500/50 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-200">
                      {t('loginFailed')}
                    </h3>
                    <div className="mt-2 text-sm text-red-100">
                      <p className="font-medium">{error}</p>
                    </div>
                  </div>
                </div>
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
                  {t('loggingIn')}
                </div>
              ) : (
                <>
                  {t('login')}
                  <ArrowRight className="ml-2 w-3 h-3" />
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-blue-500/30" />
              </div>
              <div className="relative flex justify-center text-xs sm:text-sm">
                <span className="px-2 bg-transparent text-white">{t('or')}</span>
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
              {t('loginWithGoogle')}
            </button>

            <div className="text-center text-xs sm:text-sm">
              <span className="text-white/70">
                {t('noAccount')}{' '}
              </span>
              <Link
                to="/register"
                className="login-link-gradient"
              >
                {t('registerNow')}
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
    </div>
  )
}

export default Login


