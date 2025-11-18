import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { updatePageSEO } from '../utils/seoMetaTags'
import { sendPasswordReset } from '../firebase/auth'

const ForgotPassword = () => {
  const { t, language, changeLanguage } = useLanguage()

  useEffect(() => {
    updatePageSEO('forgotPassword', language)
  }, [language])

  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const containerRef = useRef(null)
  const [draggedElement, setDraggedElement] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  const handleEmailChange = useCallback((event) => {
    event.target.setCustomValidity('')
    setEmail(event.target.value)
  }, [])

  const handleEmailInvalid = useCallback((event) => {
    if (!event.target.value) {
      event.target.setCustomValidity(t('emailRequired'))
    } else {
      event.target.setCustomValidity(t('resetEmailInvalidMessage'))
    }
  }, [t])

  const handleDragStart = (e, elementId) => {
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
  }

  const handleDragMove = (e) => {
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
  }

  const handleDragEnd = () => {
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
  }

  useEffect(() => {
    let rafId = null

    const handleMouseMove = (e) => {
      if (draggedElement) {
        e.preventDefault()

        if (rafId) {
          cancelAnimationFrame(rafId)
        }

        rafId = requestAnimationFrame(() => {
          handleDragMove(e)
        })
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

    if (!email) {
      setError(t('emailRequired'))
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setError(t('validEmailError'))
      return
    }

    if (email.length > 100) {
      setError(t('emailTooLongError'))
      return
    }

    const fakeDomains = ['test.com', 'example.com', 'fake.com', 'asdf.com', 'temp.com']
    const domain = email.split('@')[1]?.toLowerCase()
    if (fakeDomains.includes(domain)) {
      setError(`❌ ${t('invalidEmailError')}`)
      return
    }

    setLoading(true)

    const result = await sendPasswordReset(email, {
      resetPasswordSuccess: t('resetPasswordSuccess') || 'Password reset link sent to your email.',
      accountDeactivatedPasswordResetError: t('accountDeactivatedPasswordResetError') || 'Your account is deactivated. Please contact support.',
      userNotFound: t('userNotFound') || 'No account found for this email address.'
    })

    setLoading(false)

    if (result.success) {
      setIsSubmitted(true)
    } else {
      setError(result.error || t('resetPasswordError'))
    }
  }

  const shouldShowSuggestions = () => {
    if (!error) return false
    const normalized = error.toLowerCase()
    return (
      normalized.includes('bulunamad') ||
      normalized.includes('not found') ||
      normalized.includes('no user')
    )
  }

  if (isSubmitted) {
    return (
      <div
        ref={containerRef}
        className="min-h-screen animated-login-bg flex items-start sm:items-center justify-center py-16 sm:py-4 px-4 sm:px-6 lg:px-8 relative select-none"
      >
        <div id="coin-1" className="crypto-coin draggable-element" style={{ top: '10%', left: '8%', color: '#ffa726', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-1')}>₿</div>
        <div id="coin-2" className="crypto-coin draggable-element" style={{ top: '25%', right: '12%', color: '#7c8eff', animationDelay: '-3s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-2')}>Ξ</div>
        <div id="coin-3" className="crypto-coin draggable-element" style={{ bottom: '35%', left: '15%', color: '#4ade80', animationDelay: '-6s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-3')}>₮</div>
        <div id="coin-4" className="crypto-coin draggable-element" style={{ bottom: '15%', right: '20%', color: '#fcd34d', animationDelay: '-9s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-4')}>🅱</div>
        <div id="coin-5" className="crypto-coin draggable-element" style={{ top: '60%', left: '5%', color: '#3b82f6', animationDelay: '-12s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-5')}>◎</div>
        <div id="coin-6" className="crypto-coin draggable-element" style={{ top: '40%', right: '8%', color: '#34d399', animationDelay: '-2s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-6')}>Ł</div>
        <div id="coin-7" className="crypto-coin draggable-element" style={{ top: '35%', left: '25%', color: '#ffa726', animationDelay: '-4s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-7')}>₿</div>
        <div id="coin-8" className="crypto-coin draggable-element" style={{ top: '70%', right: '30%', color: '#7c8eff', animationDelay: '-7s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-8')}>Ξ</div>
        <div id="coin-9" className="crypto-coin draggable-element" style={{ bottom: '50%', left: '40%', color: '#4ade80', animationDelay: '-10s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-9')}>₮</div>
        <div id="coin-10" className="crypto-coin draggable-element" style={{ top: '80%', left: '15%', color: '#60a5fa', animationDelay: '-13s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-10')}>Ð</div>

        <div id="ticker-1" className="price-ticker green draggable-element" style={{ top: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-1')}>BTC +5.2% $98450</div>
        <div id="ticker-2" className="price-ticker red draggable-element" style={{ top: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-2')}>ETH -2.1% $3245</div>
        <div id="ticker-3" className="price-ticker green draggable-element" style={{ top: '35%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-3')}>BNB +3.8% $645</div>
        <div id="ticker-4" className="price-ticker green draggable-element" style={{ top: '60%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-4')}>SOL +7.4% $178</div>
        <div id="ticker-5" className="price-ticker red draggable-element" style={{ top: '35%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-5')}>XRP -1.5% $0.85</div>
        <div id="ticker-6" className="price-ticker green draggable-element" style={{ top: '60%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-6')}>ADA +4.3% $1.12</div>
        <div id="ticker-7" className="price-ticker red draggable-element" style={{ bottom: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-7')}>DOGE -3.2% $0.18</div>
        <div id="ticker-8" className="price-ticker green draggable-element" style={{ bottom: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-8')}>MATIC +6.1% $1.5</div>

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
            <div className="mx-auto h-12 w-12 sm:h-16 sm:w-16 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center shadow-2xl shadow-green-500/20 animate-pulse">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <h2 className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-white">
              {t('resetSummaryTitle')}
            </h2>
            <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-blue-200 font-medium">
              {t('requestSent')}
            </p>
          </div>

          <div className="login-form-container p-5 sm:p-8 text-left">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-5 space-y-4">
              <div>
                <p className="text-sm font-semibold text-blue-100 flex items-center gap-2">
                  <span>✅</span>
                  <span>{t('emailSentLabel')}</span>
                </p>
                <p className="text-xs text-blue-200 mt-1">{email}</p>
              </div>
              <ul className="space-y-2 text-xs text-blue-100/80">
                <li className="flex items-start gap-2">
                  <span>📬</span>
                  <span>{t('resetSummaryItemInbox')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>🚫</span>
                  <span>{t('resetSummaryItemSpam')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>⏳</span>
                  <span>{t('resetSummaryItemWait')}</span>
                </li>
              </ul>
              <p className="text-xs text-blue-200/70">
                {t('emailNotReceivedIn5mins')}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <Link
                  to="/register"
                  className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold transition-colors text-center"
                >
                  🆕 {t('createNewAccount')}
                </Link>
                <button
                  onClick={() => {
                    setIsSubmitted(false)
                    setEmail('')
                  }}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold transition-colors"
                  type="button"
                >
                  🔄 {t('tryDifferentEmail')}
                </button>
              </div>
            </div>
            <div className="pt-3 text-center">
              <Link
                to="/login"
                className="btn btn-primary btn-md inline-flex items-center justify-center"
              >
                <ArrowLeft className="w-3 h-3 mr-2" />
                <span>{t('backToLogin')}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen animated-login-bg flex items-start sm:items-center justify-center py-16 sm:py-4 px-4 sm:px-6 lg:px-8 relative select-none"
    >
      <div id="coin-1" className="crypto-coin draggable-element" style={{ top: '10%', left: '8%', color: '#ffa726', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-1')}>₿</div>
      <div id="coin-2" className="crypto-coin draggable-element" style={{ top: '25%', right: '12%', color: '#7c8eff', animationDelay: '-3s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-2')}>Ξ</div>
      <div id="coin-3" className="crypto-coin draggable-element" style={{ bottom: '35%', left: '15%', color: '#4ade80', animationDelay: '-6s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-3')}>₮</div>
      <div id="coin-4" className="crypto-coin draggable-element" style={{ bottom: '15%', right: '20%', color: '#fcd34d', animationDelay: '-9s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-4')}>🅱</div>
      <div id="coin-5" className="crypto-coin draggable-element" style={{ top: '60%', left: '5%', color: '#3b82f6', animationDelay: '-12s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-5')}>◎</div>
      <div id="coin-6" className="crypto-coin draggable-element" style={{ top: '40%', right: '8%', color: '#34d399', animationDelay: '-2s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-6')}>Ł</div>
      <div id="coin-7" className="crypto-coin draggable-element" style={{ top: '35%', left: '25%', color: '#ffa726', animationDelay: '-4s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-7')}>₿</div>
      <div id="coin-8" className="crypto-coin draggable-element" style={{ top: '70%', right: '30%', color: '#7c8eff', animationDelay: '-7s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-8')}>Ξ</div>
      <div id="coin-9" className="crypto-coin draggable-element" style={{ bottom: '50%', left: '40%', color: '#4ade80', animationDelay: '-10s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-9')}>₮</div>
      <div id="coin-10" className="crypto-coin draggable-element" style={{ top: '80%', left: '15%', color: '#60a5fa', animationDelay: '-13s', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'coin-10')}>Ð</div>

      <div id="ticker-1" className="price-ticker green draggable-element" style={{ top: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-1')}>BTC +5.2% $98450</div>
      <div id="ticker-2" className="price-ticker red draggable-element" style={{ top: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-2')}>ETH -2.1% $3245</div>
      <div id="ticker-3" className="price-ticker green draggable-element" style={{ top: '35%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-3')}>BNB +3.8% $645</div>
      <div id="ticker-4" className="price-ticker green draggable-element" style={{ top: '60%', left: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-4')}>SOL +7.4% $178</div>
      <div id="ticker-5" className="price-ticker red draggable-element" style={{ top: '35%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-5')}>XRP -1.5% $0.85</div>
      <div id="ticker-6" className="price-ticker green draggable-element" style={{ top: '60%', right: '5%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-6')}>ADA +4.3% $1.12</div>
      <div id="ticker-7" className="price-ticker red draggable-element" style={{ bottom: '5%', left: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-7')}>DOGE -3.2% $0.18</div>
      <div id="ticker-8" className="price-ticker green draggable-element" style={{ bottom: '5%', right: '20%', zIndex: 2, cursor: 'grab' }} onMouseDown={(e) => handleDragStart(e, 'ticker-8')}>MATIC +6.1% $1.5</div>

      <div className="candlestick green" style={{ left: '8%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick red" style={{ left: '12%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ left: '16%', bottom: '15%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '8%', top: '20%', zIndex: 2 }} />
      <div className="candlestick red" style={{ right: '12%', top: '20%', zIndex: 2 }} />
      <div className="candlestick green" style={{ right: '16%', top: '20%', zIndex: 2 }} />

      <div className="absolute top-4 right-4 sm:top-6 sm:right-6" style={{ zIndex: 101 }}>
        <select
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
          <h2 className="mt-1 sm:mt-2 text-xl sm:text-3xl font-bold text-white">
            {t('forgotPassword')} <span className="crypto-symbol">🔐</span>
          </h2>
          <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-blue-200 font-medium">
            {t('resetPasswordDescription')}
          </p>
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
                  value={email}
                  onChange={handleEmailChange}
                  onInput={handleEmailChange}
                  onInvalid={handleEmailInvalid}
                  className="input pl-8 sm:pl-10"
                  placeholder={t('emailPlaceholderRegister')}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-900/30 backdrop-blur-sm border border-red-500/50 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm text-red-200 font-medium whitespace-pre-line">{error}</p>
                    {shouldShowSuggestions() && (
                      <div className="mt-3 pt-3 border-t border-red-500/30">
                        <p className="text-xs text-red-300 mb-2">💡 {t('solutionSuggestions')}</p>
                        <ul className="text-xs text-red-300 space-y-1 ml-4">
                          <li>• {t('checkEmailCorrect')}</li>
                          <li>• {t('tryDifferentEmail')}</li>
                          <li>
                            • {t('noAccountRegister')}
                            <Link to="/register" className="underline font-semibold text-red-200 hover:text-red-100">
                              {t('createNewAccount')}
                            </Link>
                          </li>
                        </ul>
                      </div>
                    )}
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
                  {t('sending')}
                </div>
              ) : (
                t('sendResetLink')
              )}
            </button>

            <div className="text-center text-xs sm:text-sm">
              <Link
                to="/login"
                className="inline-flex items-center login-link-gradient"
              >
                <ArrowLeft className="w-3 h-3 mr-1" />
                {t('backToLogin')}
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

export default ForgotPassword


