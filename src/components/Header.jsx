import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, Bell, User, LogOut, Menu, ChevronDown, Youtube, Send, Twitter, Instagram, Crown } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

const Header = ({ onMenuClick, className }) => {
  const { theme, toggleTheme, isDark } = useTheme();
  const { user, logoutUser, isPremium } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const userMenuRef = useRef(null);

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
    setUserMenuOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [showEmailVerificationWarning, setShowEmailVerificationWarning] = useState(false)
  const [userSettings, setUserSettings] = useState(null)

  useEffect(() => {
    const checkEmailVerification = async () => {
      if (!user || !user.providerData?.some(p => p.providerId === 'password')) {
        setShowEmailVerificationWarning(false)
        return
      }

      if (user.emailVerified) {
        setShowEmailVerificationWarning(false)
        return
      }

      try {
        const { loadUserSettings } = await import('../services/mongoUserSettings')
        const result = await loadUserSettings(user.uid)

        if (result.success && result.exists && result.settings) {
          setUserSettings(result.settings)

          const createdAt = result.settings.createdAt
          if (createdAt) {
            const createdDate = new Date(createdAt)
            const now = new Date()
            const hoursSinceCreation = (now - createdDate) / (1000 * 60 * 60)

            if (hoursSinceCreation <= 24) {
              setShowEmailVerificationWarning(true)
            } else {
              setShowEmailVerificationWarning(false)
            }
          } else {
            setShowEmailVerificationWarning(false)
          }
        } else {
          setShowEmailVerificationWarning(true)
        }
      } catch (error) {
        // Offline durumunu sessizce handle et
        if (error.code !== 'unavailable' && import.meta.env.DEV) {
          console.error('Error checking email verification:', error)
        }
        setShowEmailVerificationWarning(false)
      }
    }

    checkEmailVerification()
  }, [user])

  return (
    <>
      {showEmailVerificationWarning && (
        <div className="bg-yellow-500 text-yellow-900 px-4 py-2.5 text-center text-sm font-medium">
          <div className="flex items-center justify-center space-x-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>{t('emailNotVerified')}</span>
            <button
              onClick={async () => {
                const { resendEmailVerification } = await import('../firebase/auth');
                const result = await resendEmailVerification();
                if (result.success) {
                  alert(t('verificationEmailSentAgain'));
                }
              }}
              className="ml-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-xs font-semibold transition-colors"
            >
              {t('resendVerificationEmail')}
            </button>
          </div>
        </div>
      )}

      <header className={`h-16 flex items-center bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 ${className || ''}`}>
        <div className="w-full px-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onMenuClick}
                aria-label="Menüyü aç"
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <Link to="/" className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-primary-500 rounded-md flex items-center justify-center flex-shrink-0">
                  <picture>
                    <source srcSet="/kriptotek-64.webp 1x, /kriptotek-128.webp 2x" type="image/webp" />
                    <img src="/kriptotek.webp" alt="Kriptotek" className="w-7 h-7 rounded object-cover" width="28" height="28" />
                  </picture>
                </div>
                <div className="flex flex-col">
                  <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">
                    Kriptotek
                  </span>
                  <span className="hidden sm:block text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                    {t('professionalCrypto')}
                  </span>
                </div>
              </Link>
            </div>

            <div className="flex items-center space-x-1 sm:space-x-3">
              <div className="hidden lg:flex items-center space-x-2 border-r border-gray-200 dark:border-gray-700 pr-3">
                <a href="https://youtube.com/@kriptotek" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="YouTube">
                  <Youtube className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </a>
                <a href="https://t.me/oguz8907" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Telegram">
                  <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </a>
                <a href="https://x.com/kriptotek8907" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="X (Twitter)">
                  <Twitter className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </a>
                <a href="https://instagram.com/kriptotek" target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Instagram">
                  <Instagram className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </a>
              </div>

              <div className="flex items-center">
                <div className="flex items-center">
                  <button onClick={toggleTheme} aria-label={isDark ? 'Açık temaya geç' : 'Koyu temaya geç'} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-0">
                    {isDark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-600" />}
                  </button>
                </div>
                {user && (
                  <div className="flex items-center space-x-2 sm:space-x-3 ml-2 sm:ml-3">
                    <a
                      href="https://tinyurl.com/54bf5wes"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="MEXC"
                      className="inline-flex w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 items-center justify-center transition-transform hover:scale-105 p-0 m-0 overflow-hidden"
                      title="MEXC"
                    >
                      <img src="/icons/mexc.png" alt="MEXC" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
                    </a>
                    <a
                      href="https://tinyurl.com/meusxwb"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Bitget"
                      className="inline-flex w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/90 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 items-center justify-center transition-transform hover:scale-105 p-0 m-0 overflow-hidden"
                      title="Bitget"
                    >
                      <img src="/icons/bitget.png" alt="Bitget" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
                    </a>
                  </div>
                )}
              </div>

              {!isPremium && (
                <a href="https://t.me/oguz8907" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200">
                  <Crown className="w-4 h-4" />
                  <span className="text-sm">{t('goToPremium')}</span>
                </a>
              )}

              <div className="relative" ref={userMenuRef}>
                <button onClick={() => setUserMenuOpen(!userMenuOpen)} aria-label="Kullanıcı menüsü" aria-expanded={userMenuOpen} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <div className="relative flex-shrink-0">
                    <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center overflow-hidden">
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt={user.displayName || 'User'} className="w-full h-full object-cover" referrerPolicy="no-referrer" crossOrigin="anonymous" onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="text-white"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'; }} />
                      ) : (
                        <User className="w-4 h-4 text-white" />
                      )}
                    </div>
                    {isPremium && (
                      <div className="absolute -bottom-1 -right-1 bg-primary-500 rounded-full p-0.5 shadow-md border-2 border-white dark:border-gray-800 md:hidden">
                        <Crown className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="hidden md:block text-left">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{user?.displayName || user?.email?.split('@')[0] || t('user')}</p>
                      {isPremium && (
                        <div className="flex items-center space-x-1 px-2 py-1 bg-primary-700 rounded-full shadow-sm">
                          <Crown className="w-3 h-3 text-yellow-300" />
                          <span className="text-[10px] font-bold text-yellow-300 leading-none">
                            {t('premiumUser')}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">{user?.email}</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user?.displayName || user?.email?.split('@')[0] || t('user')}</p>
                        {isPremium && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-primary-700 rounded-full shadow-sm">
                            <Crown className="w-3 h-3 text-yellow-300" />
                            <span className="text-[10px] font-bold text-yellow-300 leading-none">
                              {t('premiumUser')}
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{user?.email}</p>
                    </div>
                    <Link to="/settings" className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setUserMenuOpen(false)}>
                      <User className="w-4 h-4 mr-3" />
                      {t('profileSettings')}
                    </Link>
                    <button onClick={handleLogout} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <LogOut className="w-4 h-4 mr-3" />
                      {t('logout')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;

