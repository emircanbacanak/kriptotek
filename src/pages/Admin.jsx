import React, { useState, useEffect } from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { useTheme } from '../contexts/ThemeContext'
import { updatePageSEO } from '../utils/seoMetaTags'
import adminService from '../services/adminService'
import { useAuth } from '../contexts/AuthContext'
import { clearSettingsCache } from '../services/mongoUserSettings'
import {
  Search,
  User,
  Shield,
  Crown,
  Power,
  Users,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

const Admin = () => {
  const { t, language } = useLanguage()
  const { theme } = useTheme()
  const { user, isAdmin, refreshUserSettings, updatePremiumStatus, updateAdminStatus } = useAuth()

  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // all, premium, regular, admin, inactive
  const [refreshing, setRefreshing] = useState(false)

  // Header gradients
  const headerIconGradient = theme === 'dark'
    ? 'from-red-600 to-orange-600'
    : 'from-red-500 to-orange-500'

  const headerTextGradient = theme === 'dark'
    ? 'from-red-400 to-orange-400'
    : 'from-red-600 to-orange-600'

  // SEO
  useEffect(() => {
    updatePageSEO('admin', language)
  }, [language])

  // Admin kontrolü
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-50/50 dark:from-gray-950 dark:via-blue-950/20 dark:to-indigo-950/20 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-red-200/50 dark:border-red-900/50 p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <Shield className="w-10 h-10 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            {t('unauthorizedAccess')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {t('unauthorizedAccessDesc')}
          </p>
        </div>
      </div>
    )
  }

  // Load users
  const loadUsers = async (showLoading = false) => {
    // Sadece ilk yüklemede veya manuel yenilemede loading göster
    if (showLoading) {
      setLoading(true)
    } else {
      // Sessiz güncelleme için refreshing state'ini kullan (sadece refresh butonu animasyonu için)
      setRefreshing(true)
    }

    try {
      const result = await adminService.getAllUsers()
      if (result.success) {
        setUsers(result.users)
        setFilteredUsers(result.users)
      } else {
        console.error(t('loadUsersError') + ':', result.error)
        setUsers([])
        setFilteredUsers([])
      }
    } catch (error) {
      console.error('❌ ' + t('loadUsersError') + ':', error)
      setUsers([])
      setFilteredUsers([])
    } finally {
      if (showLoading) {
        setLoading(false)
      } else {
        setRefreshing(false)
      }
    }
  }

  // İlk yükleme
  useEffect(() => {
    // İlk yüklemede loading göster
    loadUsers(true)

    // Polling: Her 30 saniyede bir sessizce güncelle (loading gösterme)
    const interval = setInterval(() => {
      loadUsers(false) // Sessiz güncelleme
    }, 30000) // 30 saniye

    return () => {
      clearInterval(interval)
    }
  }, [])

  // Manual refresh
  const handleRefresh = async () => {
    // Manuel yenilemede loading göster
    await loadUsers(true)
  }

  // Filter and search users
  useEffect(() => {
    let filtered = users

    // Filter by type
    if (filterType === 'premium') {
      filtered = filtered.filter(user => user.isPremium)
    } else if (filterType === 'regular') {
      filtered = filtered.filter(user => !user.isPremium)
    } else if (filterType === 'admin') {
      filtered = filtered.filter(user => user.isAdmin)
    } else if (filterType === 'inactive') {
      filtered = filtered.filter(user => user.isActive === false)
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(searchLower) ||
        user.displayName.toLowerCase().includes(searchLower) ||
        user.uid.toLowerCase().includes(searchLower)
      )
    }

    // Separate premium and regular users
    const premiumUsers = filtered.filter(user => user.isPremium)
    const regularUsers = filtered.filter(user => !user.isPremium)

    // Combine: premium first, then regular
    const sortedFiltered = [...premiumUsers, ...regularUsers]
    setFilteredUsers(sortedFiltered)
  }, [searchTerm, filterType, users])

  const handleTogglePremium = async (userId, currentPremium, userSource) => {
    const newPremiumStatus = !currentPremium

    // Önce local state'i anında güncelle (optimistic update)
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.uid === userId ? { ...u, isPremium: newPremiumStatus } : u
      )
    )

    // Eğer kullanıcı kendisini premium yapıyorsa, AuthContext'i HEMEN güncelle
    if (user && user.uid === userId) {
      updatePremiumStatus(newPremiumStatus)
    }

    // Backend'e gönder (await yapmadan, arka planda çalışsın)
    adminService.toggleUserPremium(userId, newPremiumStatus)
      .then((result) => {
        if (result.success) {
          // Kullanıcının cache'ini temizle (taze veri için)
          clearSettingsCache(userId)

          // Kullanıcı listesini sessizce yenile (loading gösterme) - arka planda
          loadUsers(false).catch(() => {
            // Hata olsa bile optimistic update zaten yapıldı
          })

          // Eğer kullanıcı kendisini premium yapıyorsa, backend'den doğrulama yap (arka planda)
          if (user && user.uid === userId) {
            // Kısa bir süre bekleyip refresh yap (backend'in güncellemesi için)
            setTimeout(() => {
              refreshUserSettings().catch(() => {
                // Hata olsa bile optimistic update zaten yapıldı
              })
            }, 500) // 0.5 saniye sonra doğrulama yap
          }
        } else {
          // Hata durumunda geri al (rollback)
          setUsers(prevUsers =>
            prevUsers.map(u =>
              u.uid === userId ? { ...u, isPremium: currentPremium } : u
            )
          )

          // Eğer kullanıcı kendisiyse AuthContext'i de geri al
          if (user && user.uid === userId) {
            updatePremiumStatus(currentPremium)
          }

          alert(t('togglePremiumError') + ': ' + result.error)
        }
      })
      .catch((error) => {
        // Network hatası durumunda geri al (rollback)
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.uid === userId ? { ...u, isPremium: currentPremium } : u
          )
        )

        // Eğer kullanıcı kendisiyse AuthContext'i de geri al
        if (user && user.uid === userId) {
          updatePremiumStatus(currentPremium)
        }

        alert(t('togglePremiumError') + ': ' + error.message)
      })
  }

  const handleToggleActive = async (userId, currentActive, userSource) => {
    const newActiveStatus = !currentActive

    // Önce local state'i anında güncelle (optimistic update)
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.uid === userId ? { ...u, isActive: newActiveStatus } : u
      )
    )

    // Backend'e gönder (await yapmadan, arka planda çalışsın)
    const serviceCall = currentActive
      ? adminService.deactivateUser(userId)
      : adminService.activateUser(userId)

    serviceCall
      .then((result) => {
        if (result.success) {
          // Kullanıcı listesini sessizce yenile (loading gösterme) - arka planda
          loadUsers(false).catch(() => {
            // Hata olsa bile optimistic update zaten yapıldı
          })
        } else {
          // Hata durumunda geri al (rollback)
          setUsers(prevUsers =>
            prevUsers.map(u =>
              u.uid === userId ? { ...u, isActive: currentActive } : u
            )
          )
          alert(t('toggleActiveError') + ': ' + result.error)
        }
      })
      .catch((error) => {
        // Network hatası durumunda geri al (rollback)
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.uid === userId ? { ...u, isActive: currentActive } : u
          )
        )
        alert(t('toggleActiveError') + ': ' + error.message)
      })
  }

  const handleToggleAdmin = async (userId, currentAdmin, userSource) => {
    const newAdminStatus = !currentAdmin

    // Önce local state'i anında güncelle (optimistic update)
    setUsers(prevUsers =>
      prevUsers.map(u =>
        u.uid === userId ? { ...u, isAdmin: newAdminStatus } : u
      )
    )

    // Eğer kullanıcı kendisini admin yapıyorsa, AuthContext'i HEMEN güncelle
    if (user && user.uid === userId) {
      updateAdminStatus(newAdminStatus)
    }

    // Backend'e gönder (await yapmadan, arka planda çalışsın)
    adminService.setUserAsAdmin(userId, newAdminStatus)
      .then((result) => {
        if (result.success) {
          // Kullanıcı listesini sessizce yenile (loading gösterme) - arka planda
          loadUsers(false).catch(() => {
            // Hata olsa bile optimistic update zaten yapıldı
          })

          // Eğer kullanıcı kendisini admin yapıyorsa, backend'den doğrulama yap (arka planda)
          if (user && user.uid === userId) {
            // Kısa bir süre bekleyip refresh yap (backend'in güncellemesi için)
            setTimeout(() => {
              refreshUserSettings().catch(() => {
                // Hata olsa bile optimistic update zaten yapıldı
              })
            }, 500) // 0.5 saniye sonra doğrulama yap
          }
        } else {
          // Hata durumunda geri al (rollback)
          setUsers(prevUsers =>
            prevUsers.map(u =>
              u.uid === userId ? { ...u, isAdmin: currentAdmin } : u
            )
          )

          // Eğer kullanıcı kendisiyse AuthContext'i de geri al
          if (user && user.uid === userId) {
            updateAdminStatus(currentAdmin)
          }

          alert(t('toggleAdminError') + ': ' + result.error)
        }
      })
      .catch((error) => {
        // Network hatası durumunda geri al (rollback)
        setUsers(prevUsers =>
          prevUsers.map(u =>
            u.uid === userId ? { ...u, isAdmin: currentAdmin } : u
          )
        )

        // Eğer kullanıcı kendisiyse AuthContext'i de geri al
        if (user && user.uid === userId) {
          updateAdminStatus(currentAdmin)
        }

        alert(t('toggleAdminError') + ': ' + error.message)
      })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  // Separate users into premium and regular
  const premiumUsers = filteredUsers.filter(user => user.isPremium)
  const regularUsers = filteredUsers.filter(user => !user.isPremium)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 mb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl bg-gradient-to-br ${headerIconGradient} flex items-center justify-center shadow-lg`}>
                <Shield className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
              </div>
              <div>
                <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold bg-gradient-to-r ${headerTextGradient} bg-clip-text text-transparent`}>
                  {t('adminManagement')}
                </h1>
                <p className="text-xs sm:text-sm lg:text-base text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">
                  {t('adminManagementDescription')}
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('refresh')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Search and Filter Bar */}
        <div className="mb-6 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder={t('searchUser')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${filterType === 'all'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <Users className="w-4 h-4 mr-2" />
              {t('all')}
            </button>
            <button
              onClick={() => setFilterType('premium')}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${filterType === 'premium'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <Crown className="w-4 h-4 mr-2" />
              {t('premium')}
            </button>
            <button
              onClick={() => setFilterType('regular')}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${filterType === 'regular'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <User className="w-4 h-4 mr-2" />
              {t('regular')}
            </button>
            <button
              onClick={() => setFilterType('admin')}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${filterType === 'admin'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <Shield className="w-4 h-4 mr-2" />
              {t('admin')}
            </button>
            <button
              onClick={() => setFilterType('inactive')}
              className={`flex items-center px-4 py-2 rounded-lg transition-colors ${filterType === 'inactive'
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
              <Power className="w-4 h-4 mr-2" />
              {t('inactive')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">{t('totalUsers')}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white mt-2">{users.length}</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg shadow p-4 text-white">
            <div className="text-sm opacity-90">{t('premium')}</div>
            <div className="text-2xl font-bold mt-2">{premiumUsers.length}</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg shadow p-4 text-white">
            <div className="text-sm opacity-90">{t('regular')}</div>
            <div className="text-2xl font-bold mt-2">{regularUsers.length}</div>
          </div>
          <div className="bg-gradient-to-br from-red-500 to-pink-500 rounded-lg shadow p-4 text-white">
            <div className="text-sm opacity-90">{t('admin')}</div>
            <div className="text-2xl font-bold mt-2">{users.filter(u => u.isAdmin).length}</div>
          </div>
        </div>

        {/* Users List - Premium Section */}
        {premiumUsers.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center mb-4">
              <Crown className="w-6 h-6 text-yellow-500 mr-2" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('premiumUsers')} ({premiumUsers.length})</h2>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
              {premiumUsers.map((user) => (
                <UserCard
                  key={user.uid}
                  user={user}
                  onTogglePremium={handleTogglePremium}
                  onToggleActive={handleToggleActive}
                  onToggleAdmin={handleToggleAdmin}
                />
              ))}
            </div>
          </div>
        )}

        {/* Users List - Regular Section */}
        {regularUsers.length > 0 && (
          <div>
            <div className="flex items-center mb-4">
              <User className="w-6 h-6 text-blue-500 mr-2" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('regularUsers')} ({regularUsers.length})</h2>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
              {regularUsers.map((user) => (
                <UserCard
                  key={user.uid}
                  user={user}
                  onTogglePremium={handleTogglePremium}
                  onToggleActive={handleToggleActive}
                  onToggleAdmin={handleToggleAdmin}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredUsers.length === 0 && !loading && (
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-2">
              {t('userNotFound')}
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm max-w-2xl mx-auto">
              {t('userNotFoundDescription')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// User Card Component
const UserCard = ({ user, onTogglePremium, onToggleActive, onToggleAdmin }) => {
  const { t } = useLanguage()
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4 flex-1">
          <div className="relative">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || user.email || t('user')}
                className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                onError={(e) => {
                  e.target.style.display = 'none'
                  const fallback = e.target.nextElementSibling
                  if (fallback) fallback.style.display = 'flex'
                }}
              />
            ) : null}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${user.isPremium
              ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
              : 'bg-gradient-to-br from-blue-500 to-indigo-500'
              } ${user.photoURL ? 'hidden' : ''}`}>
              <User className="w-6 h-6 text-white" />
            </div>
            {user.isAdmin && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800">
                <Shield className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                {(() => {
                  // Kullanıcı adı varsa göster
                  if (user.displayName) {
                    return user.displayName
                  }
                  // Email'den kullanıcı adı oluştur
                  if (user.email) {
                    const emailPart = user.email.split('@')[0]
                    return emailPart.charAt(0).toUpperCase() + emailPart.slice(1).toLowerCase()
                  }
                  // Hiçbiri yoksa varsayılan
                  return t('user')
                })()}
              </h3>
              {user.isPremium && <Crown className="w-4 h-4 text-yellow-500 flex-shrink-0" />}
              {user.isAdmin && <Shield className="w-4 h-4 text-red-500 flex-shrink-0" />}
              {user.isActive === false && (
                <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded-full">
                  {t('inactive')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {user.email || (user.uid ? `ID: ${user.uid.substring(0, 12)}...` : t('unknown'))}
            </p>
            <div className="flex items-center space-x-2 mt-1">
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {t('userId')}: {user.uid}
              </p>
              {user.source === 'firebase' && (
                <span className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
                  Firebase
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Toggle Premium */}
          <button
            onClick={() => onTogglePremium(user.uid, user.isPremium, user.source)}
            className={`p-2 rounded-lg transition-colors ${user.isPremium
              ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-800'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            title={user.isPremium ? t('removePremium') : t('makePremium')}
          >
            <Crown className="w-5 h-5" />
          </button>

          {/* Toggle Active/Inactive */}
          <button
            onClick={() => onToggleActive(user.uid, user.isActive !== false, user.source)}
            className={`p-2 rounded-lg transition-colors ${user.isActive !== false
              ? 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-800'
              : 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-800'
              }`}
            title={user.isActive !== false ? t('deactivate') : t('activate')}
          >
            <Power className="w-5 h-5" />
          </button>

          {/* Toggle Admin */}
          <button
            onClick={() => onToggleAdmin(user.uid, user.isAdmin, user.source)}
            className={`p-2 rounded-lg transition-colors ${user.isAdmin
              ? 'bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            title={user.isAdmin ? t('removeAdmin') : t('makeAdmin')}
          >
            <Shield className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Admin
