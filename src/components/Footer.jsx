import React from 'react'
import { useLanguage } from '../contexts/LanguageContext'
import { Youtube, Send, Twitter, Instagram } from 'lucide-react'

const Footer = () => {
  const { t } = useLanguage()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 sm:py-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Başlık ve Alt Başlık */}
        <div className="text-center mb-6">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2">
            {t('platformTitle')}
          </h3>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {t('platformTagline')}
          </p>
        </div>

        {/* Sosyal Medya İkonları - Mobil ve Desktop'ta yan yana */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
          <a
            href="https://www.youtube.com/@kriptotek8907"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-200 hover:scale-110"
            title="YouTube"
          >
            <Youtube className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>

          <a
            href="https://t.me/oguz8907"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all duration-200 hover:scale-110"
            title="Telegram"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>

          <a
            href="https://x.com/kriptotek8907"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 transition-all duration-200 hover:scale-110"
            title="X (Twitter)"
          >
            <Twitter className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>

          <a
            href="https://www.instagram.com/kriptotek/"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 text-white hover:from-yellow-500 hover:via-pink-600 hover:to-purple-700 transition-all duration-200 hover:scale-110"
            title="Instagram"
          >
            <Instagram className="w-4 h-4 sm:w-5 sm:h-5" />
          </a>
        </div>

        {/* Borsa Kayıt Butonları */}
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6">
          <a
            href="https://tinyurl.com/54bf5wes"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 items-center justify-center transition-transform hover:scale-105 p-0 m-0 overflow-hidden"
            title="MEXC - Kayıt Ol"
          >
            <img src="/icons/mexc.png" alt="MEXC" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
          </a>
          <a
            href="https://tinyurl.com/meusxwb"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/90 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 items-center justify-center transition-transform hover:scale-105 p-0 m-0 overflow-hidden"
            title="Bitget - Kayıt Ol"
          >
            <img src="/icons/bitget.png" alt="Bitget" className="w-9 h-9 sm:w-10 sm:h-10 object-contain" />
          </a>
        </div>

        {/* Disclaimer */}
        <div className="text-center mb-3">
          <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 font-medium">
            {t('disclaimer')}
          </p>
        </div>

        {/* Copyright ve Tasarımcı Bilgisi */}
        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 text-center">
          <span>© {currentYear} Kriptotek. {t('allRightsReserved')}</span>
          <span>•</span>
          <span>{t('madeWith')}</span>
          <a
            href="https://www.instagram.com/emirbcnk/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors underline"
          >
            Emir Can Bacanak
          </a>
        </div>
      </div>
    </footer>
  )
}

export default Footer

