import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

const AccountDeactivationNotification = () => {
  const { isActive, logoutUser } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [countdown, setCountdown] = useState(3)
  const [showNotification, setShowNotification] = useState(false)

  useEffect(() => {
    // isActive false ise bildirimi göster
    if (isActive === false) {
      setShowNotification(true)
      setCountdown(3)
    } else {
      setShowNotification(false)
    }
  }, [isActive])

  useEffect(() => {
    if (!showNotification) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Geri sayım bitti, çıkış yap ve login'e yönlendir
          clearInterval(timer)
          logoutUser().then(() => {
            navigate('/login', { replace: true })
          })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showNotification, logoutUser, navigate])

  if (!showNotification) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-orange-500 p-8 max-w-md w-full mx-4 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {t('accountDeactivated') || 'Hesabınız Pasif Edildi'}
            </h3>
          </div>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            {t('accountDeactivatedMessage') || 'Hesabınız yönetici tarafından pasif edilmiştir. Giriş yapamazsınız.'}
          </p>
          
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 text-center">
            <div className="text-4xl font-bold text-orange-600 dark:text-orange-400 mb-2">
              {countdown}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('redirectingToLogin') || 'Giriş sayfasına yönlendiriliyorsunuz...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountDeactivationNotification

