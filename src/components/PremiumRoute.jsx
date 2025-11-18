import React, { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { Link } from 'react-router-dom'
import { 
  ShieldAlert, 
  ArrowRight, 
  Home, 
  Crown, 
  Wallet, 
  PieChart, 
  TrendingUp, 
  Star, 
  Activity,
  BarChart3,
  Sparkles
} from 'lucide-react'

const PremiumRoute = ({ children }) => {
  const { user, isPremium, isAdmin, loading } = useAuth()
  const location = useLocation()
  const { t } = useLanguage()

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full py-12">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Premium VEYA Admin kullanıcılar premium özelliklere erişebilir
  if (isPremium || isAdmin) {
    return children
  }
  
  const features = [
    { 
      icon: Wallet, 
      title: t('premiumFeaturePortfolio'), 
      desc: t('premiumFeaturePortfolioDesc'),
      gradient: 'from-blue-500 to-cyan-500',
      delay: '0ms'
    },
    { 
      icon: PieChart, 
      title: t('premiumFeatureDominance'), 
      desc: t('premiumFeatureDominanceDesc'),
      gradient: 'from-purple-500 to-pink-500',
      delay: '100ms'
    },
    { 
      icon: TrendingUp, 
      title: t('premiumFeatureTrend'), 
      desc: t('premiumFeatureTrendDesc'),
      gradient: 'from-green-500 to-emerald-500',
      delay: '200ms'
    },
    { 
      icon: Star, 
      title: t('premiumFeatureFavorites'), 
      desc: t('premiumFeatureFavoritesDesc'),
      gradient: 'from-yellow-500 to-orange-500',
      delay: '300ms'
    },
    { 
      icon: BarChart3, 
      title: t('premiumFeatureFedRate'), 
      desc: t('premiumFeatureFedRateDesc'),
      gradient: 'from-indigo-500 to-blue-500',
      delay: '400ms'
    },
    { 
      icon: Activity, 
      title: t('premiumFeatureSupply'), 
      desc: t('premiumFeatureSupplyDesc'),
      gradient: 'from-red-500 to-rose-500',
      delay: '500ms'
    },
    { 
      icon: PieChart, 
      title: t('premiumFeatureMarket'), 
      desc: t('premiumFeatureMarketDesc'),
      gradient: 'from-teal-500 to-cyan-500',
      delay: '600ms'
    },
    { 
      icon: Sparkles, 
      title: t('premiumFeatureCharts'), 
      desc: t('premiumFeatureChartsDesc'),
      gradient: 'from-violet-500 to-purple-500',
      delay: '700ms'
    }
  ]

  return (
    <div className="w-full py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="max-w-6xl w-full space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-4 animate-fade-in" style={{ animationDelay: '0ms' }}>
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full blur-xl opacity-50 animate-pulse"></div>
            <ShieldAlert className="relative mx-auto h-16 w-16 text-yellow-500 animate-bounce" style={{ animationDuration: '2s' }} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500">
            {t('premiumRequired')}
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {t('premiumRequiredDesc')}
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {features.map((feature, index) => {
            const IconComponent = feature.icon
            
            return (
              <div
                key={index}
                className="group relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
                style={{ 
                  animation: `fade-in 0.6s ease-out ${feature.delay} both`
                }}
              >
                {/* Gradient Background on Hover - Only for this card */}
                <div 
                  className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} rounded-2xl transition-opacity duration-300 pointer-events-none opacity-0 group-hover:opacity-10`}
                ></div>
                
                {/* Icon - Isolated hover effect */}
                <div 
                  className={`relative w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 shadow-lg transition-transform duration-300 mx-auto group-hover:scale-110`}
                >
                  <IconComponent className="w-7 h-7 text-white" />
                </div>
                
                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 transition-colors duration-300 relative z-10 text-center">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed relative z-10 text-center">
                  {feature.desc}
                </p>
                
                {/* Shine Effect - Isolated to this card only */}
                <div 
                  className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                >
                  <div 
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full skew-x-12 transition-transform duration-1000"
                  ></div>
                </div>
              </div>
            )
          })}
        </div>

        {/* CTA Section */}
        <div className="pt-8 space-y-4 animate-fade-in" style={{ animationDelay: '800ms' }}>
          <a
            href="https://t.me/oguz8907"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative w-full flex items-center justify-center px-8 py-4 border border-transparent text-lg font-bold rounded-xl text-white bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 hover:from-yellow-600 hover:via-orange-600 hover:to-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl overflow-hidden"
          >
            {/* Shine Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            
            <Crown className="w-6 h-6 mr-3 relative z-10" />
            <span className="relative z-10">{t('buyPremium')}</span>
            <ArrowRight className="w-5 h-5 ml-3 relative z-10 transform group-hover:translate-x-1 transition-transform" />
          </a>
          
          <Link
            to="/"
            className="w-full flex items-center justify-center px-8 py-4 border-2 border-gray-300 dark:border-gray-600 text-lg font-medium rounded-xl text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-all duration-300 transform hover:scale-105"
          >
            <Home className="w-5 h-5 mr-3" />
            {t('backToHome')}
          </Link>
        </div>
        
        {/* Contact Info */}
        <div className="text-center pt-6 animate-fade-in" style={{ animationDelay: '900ms' }}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('premiumContactInfo')}{' '}
            <a 
              href="https://t.me/oguz8907" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              {t('telegram')}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default PremiumRoute

