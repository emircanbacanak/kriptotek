import React, { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useTheme } from '../contexts/ThemeContext'
import useFedRateData from '../hooks/useFedRateData'
import { updatePageSEO } from '../utils/seoMetaTags'

function FedRate() {
  const { t, language } = useLanguage()
  const { theme } = useTheme()
  const { fedRateData, loading: globalLoading, isUpdating } = useFedRateData()
  
  const [errorMessage, setErrorMessage] = useState('')
  
  // useFedRateData'dan gelen veriyi kullan
  const data = fedRateData || {
    announcedUpper: null,
    announcedLower: null,
    previousUpper: null,
    previousLower: null,
    lastAnnounceDate: null,
    nextDecisionDate: null,
  }
  
  const isLoading = globalLoading

  // Live countdown effect (updates every second)
  const [countdownTrigger, setCountdownTrigger] = useState(Date.now())
  
  useEffect(() => {
    updatePageSEO('fedRate', language)
  }, [language])
  
  useEffect(() => {
    if (!data.nextDecisionDate) return

    const interval = setInterval(() => {
      setCountdownTrigger(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [data.nextDecisionDate])

  // Auto-refresh: globalDataManager otomatik güncelleme yapıyor, burada sadece countdown için interval

  const countdown = useMemo(() => {
    if (!data.nextDecisionDate) return null
    const target = new Date(data.nextDecisionDate).getTime()
    const now = countdownTrigger // Use countdown trigger to force recalculation
    const diff = target - now
    
    // If expired, show waiting state
    if (diff <= 0) {
      return { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }
    }
    
    const weeks = Math.floor(diff / (7 * 24 * 60 * 60 * 1000))
    const days = Math.floor((diff % (7 * 24 * 60 * 60 * 1000)) / (24 * 60 * 60 * 1000))
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
    const seconds = Math.floor((diff % (60 * 1000)) / 1000)
    
    return { weeks, days, hours, minutes, seconds, isExpired: false }
  }, [data.nextDecisionDate, countdownTrigger])

  const announcedLabel = useMemo(() => {
    const { announcedUpper, announcedLower } = data
    if (announcedUpper == null || announcedLower == null) return '—'
    if (announcedUpper === announcedLower) return `${announcedUpper.toFixed(2)}%`
    return `${announcedLower.toFixed(2)}% – ${announcedUpper.toFixed(2)}%`
  }, [data])

  const previousLabel = useMemo(() => {
    const { previousUpper, previousLower } = data
    if (previousUpper == null || previousLower == null) return '—'
    if (previousUpper === previousLower) return `${previousUpper.toFixed(2)}%`
    return `${previousLower.toFixed(2)}% – ${previousUpper.toFixed(2)}%`
  }, [data])

  // Get gradient classes based on theme
  const countdownGradient = useMemo(() => {
    return theme === 'dark' 
      ? 'from-blue-500 via-indigo-600 to-purple-500'
      : 'from-cyan-500 via-blue-500 to-indigo-500'
  }, [theme])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30 max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 animate-fade-in">
          <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br from-blue-500 to-indigo-500 dark:from-blue-600 dark:to-indigo-600 rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110`}>
            <svg className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">
              {t('fedRateTracking')}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 hidden sm:block">{t('fedRateDescription')}</p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
        )}

        {!isLoading && errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-800 dark:text-red-200">{errorMessage}</span>
            </div>
          </div>
        )}

        {!isLoading && !errorMessage && (
          <div className="space-y-6">
            {/* Live Countdown Section */}
            {data.nextDecisionDate && countdown && (
              <section className="relative overflow-hidden rounded-2xl shadow-2xl animate-fade-in">
                <div className={`absolute inset-0 bg-gradient-to-br ${countdownGradient}`}></div>
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBvcGFjaXR5PSIwLjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30"></div>
                
                <div className="relative p-6 sm:p-8">
                  <div className="text-center mb-6 sm:mb-8">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">{t('fedRateDecision')}</h2>
                    <p className="text-blue-100 text-base sm:text-lg">
                      {new Date(data.nextDecisionDate).toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      })} {new Date(data.nextDecisionDate).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  {countdown.isExpired ? (
                    <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                      <div className="relative w-16 sm:w-20 h-16 sm:h-20 mb-4 sm:mb-6">
                        <div className="absolute inset-0 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                        <div className="absolute inset-4 border-4 border-white/30 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white mb-2">{t('announcing')}</p>
                      <p className="text-blue-100 text-sm sm:text-base">{t('waitingForData')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2 sm:gap-3">
                      {[
                        { value: countdown.weeks, label: t('week') },
                        { value: countdown.days, label: t('day') },
                        { value: countdown.hours, label: t('hour') },
                        { value: countdown.minutes, label: t('minute') },
                        { value: countdown.seconds, label: t('second') }
                      ].map((item, idx) => (
                        <div key={idx} className="relative group">
                          <div className="absolute inset-0 bg-white/20 rounded-xl blur-lg group-hover:blur-xl transition-all duration-300"></div>
                          <div className="relative bg-white/10 backdrop-blur-lg rounded-xl p-2 sm:p-4 border border-white/20 transform transition-all duration-300 hover:scale-105 hover:bg-white/20">
                            <div className="text-3xl sm:text-5xl lg:text-6xl font-bold text-white tabular-nums mb-1 sm:mb-2 animate-pulse-subtle" style={{ animationDelay: `${idx * 0.1}s` }}>
                              {item.value}
                            </div>
                            <div className="text-xs sm:text-sm text-blue-100 uppercase tracking-wide font-semibold">{item.label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Rate Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
                <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('announced')}</span>
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">{announcedLabel}</div>
                </div>
              </div>

              <div className="group relative">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300"></div>
                <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">{t('previous')}</span>
                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">{previousLabel}</div>
                </div>
              </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('lastPublished')}</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                  {data.lastAnnounceDate ? new Date(data.lastAnnounceDate).toLocaleString() : '—'}
                </p>
                <a className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:gap-3 transition-all font-medium" href="https://www.federalreserve.gov/feeds/press_monetary.xml" target="_blank" rel="noreferrer">
                  {t('fedRssLink')}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>

              <div className="bg-white/60 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{t('nextDecision')}</span>
                </div>
                <p className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                  {data.nextDecisionDate ? new Date(data.nextDecisionDate).toLocaleString() : '—'}
                </p>
                <a className="inline-flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:gap-3 transition-all font-medium" href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noreferrer">
                  {t('fomcCalendarLink')}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FedRate
