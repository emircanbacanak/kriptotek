export const updatePageSEO = (page, language) => {
  const titleMap = {
    home: {
      tr: 'Kriptotek - Ana Sayfa',
      en: 'Kriptotek - Home'
    },
    login: {
      tr: 'Kriptotek - Giriş Yap',
      en: 'Kriptotek - Login'
    },
    register: {
      tr: 'Kriptotek - Kayıt Ol',
      en: 'Kriptotek - Register'
    },
    forgotPassword: {
      tr: 'Kriptotek - Şifre Sıfırla',
      en: 'Kriptotek - Reset Password'
    },
    marketOverview: {
      tr: 'Kriptotek - Piyasa Genel Bakış',
      en: 'Kriptotek - Market Overview'
    },
    dominance: {
      tr: 'Kriptotek - Piyasa Dominansı',
      en: 'Kriptotek - Market Dominance'
    },
    trending: {
      tr: 'Kriptotek - Trend Kripto Paralar',
      en: 'Kriptotek - Trending Cryptocurrencies'
    },
    favorites: {
      tr: 'Kriptotek - Favorilerim',
      en: 'Kriptotek - My Favorites'
    },
    news: {
      tr: 'Kriptotek - Kripto Haberler',
      en: 'Kriptotek - Crypto News'
    },
    fedRate: {
      tr: 'Kriptotek - Fed Faiz Oranı',
      en: 'Kriptotek - Fed Interest Rate'
    },
    supplyTracking: {
      tr: 'Kriptotek - Arz Takibi',
      en: 'Kriptotek - Supply Tracking'
    },
    settings: {
      tr: 'Kriptotek - Ayarlar',
      en: 'Kriptotek - Settings'
    },
    admin: {
      tr: 'Kriptotek - Yönetim Paneli',
      en: 'Kriptotek - Admin Panel'
    },
    notFound: {
      tr: 'Kriptotek - Sayfa Bulunamadı',
      en: 'Kriptotek - Page Not Found'
    }
  }

  const lang = language || 'tr'
  const pageConfig = titleMap[page] || titleMap.home
  const title = pageConfig[lang] || pageConfig.tr

  document.title = title
}


