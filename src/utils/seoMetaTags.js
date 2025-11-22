// Base URL - production'da gerçek domain, development'ta localhost
const getBaseUrl = () => {
  if (typeof window === 'undefined') return ''
  const protocol = window.location.protocol
  const host = window.location.host
  return `${protocol}//${host}`
}

const getPageUrl = (page) => {
  const baseUrl = getBaseUrl()
  const pageRoutes = {
    home: '/',
    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    marketOverview: '/market-overview',
    trending: '/trending',
    favorites: '/favorites',
    news: '/news',
    fedRate: '/fed-rate',
    supplyTracking: '/supply-tracking',
    settings: '/settings',
    admin: '/admin',
    portfolio: '/portfolio',
    notFound: '/404'
  }
  return `${baseUrl}${pageRoutes[page] || '/'}`
}

export const updatePageSEO = (page, language) => {
  const pageConfigs = {
    home: {
      tr: {
        title: 'Kriptotek - Ana Sayfa',
        description: '500+ kripto para birimini profesyonelce takip edin. Anlık fiyatlar, piyasa analizi ve trend takibi.',
        keywords: 'kripto para, bitcoin, ethereum, kripto takip, kripto analiz, kripto fiyat'
      },
      en: {
        title: 'Kriptotek - Home',
        description: 'Track 500+ cryptocurrencies professionally. Real-time prices, market analysis, and trend tracking.',
        keywords: 'cryptocurrency, bitcoin, ethereum, crypto tracking, crypto analysis, crypto price'
      }
    },
    login: {
      tr: {
        title: 'Kriptotek - Giriş Yap',
        description: 'Kriptotek hesabınıza giriş yapın ve kripto varlıklarınızı takip etmeye başlayın.',
        keywords: 'kriptotek giriş, kripto takip, giriş yap'
      },
      en: {
        title: 'Kriptotek - Login',
        description: 'Login to your Kriptotek account and start tracking your crypto assets.',
        keywords: 'kriptotek login, crypto tracking, sign in'
      }
    },
    register: {
      tr: {
        title: 'Kriptotek - Kayıt Ol',
        description: 'Kriptotek hesabı oluşturun ve kripto para takip platformuna katılın.',
        keywords: 'kriptotek kayıt, kripto takip, hesap oluştur'
      },
      en: {
        title: 'Kriptotek - Register',
        description: 'Create a Kriptotek account and join the crypto tracking platform.',
        keywords: 'kriptotek register, crypto tracking, create account'
      }
    },
    forgotPassword: {
      tr: {
        title: 'Kriptotek - Şifre Sıfırla',
        description: 'Kriptotek hesabınızın şifresini sıfırlayın.',
        keywords: 'şifre sıfırla, kriptotek şifre'
      },
      en: {
        title: 'Kriptotek - Reset Password',
        description: 'Reset your Kriptotek account password.',
        keywords: 'reset password, kriptotek password'
      }
    },
    marketOverview: {
      tr: {
        title: 'Kriptotek - Piyasa Genel Bakış',
        description: 'Kripto para piyasasının genel bakışını görüntüleyin. Bitcoin dominance, market cap ve trend analizi.',
        keywords: 'piyasa genel bakış, bitcoin dominance, kripto piyasa'
      },
      en: {
        title: 'Kriptotek - Market Overview',
        description: 'View the cryptocurrency market overview. Bitcoin dominance, market cap, and trend analysis.',
        keywords: 'market overview, bitcoin dominance, crypto market'
      }
    },
    trending: {
      tr: {
        title: 'Kriptotek - Trend Kripto Paralar',
        description: 'AI destekli trend analizi ile en popüler ve trend olan kripto paraları keşfedin.',
        keywords: 'trend kripto, popüler kripto, AI analiz, kripto trend'
      },
      en: {
        title: 'Kriptotek - Trending Cryptocurrencies',
        description: 'Discover the most popular and trending cryptocurrencies with AI-powered trend analysis.',
        keywords: 'trending crypto, popular crypto, AI analysis, crypto trend'
      }
    },
    favorites: {
      tr: {
        title: 'Kriptotek - Favorilerim',
        description: 'Favori kripto paralarınızı takip edin ve anlık fiyat güncellemeleri alın.',
        keywords: 'favori kripto, kripto takip, favoriler'
      },
      en: {
        title: 'Kriptotek - My Favorites',
        description: 'Track your favorite cryptocurrencies and get real-time price updates.',
        keywords: 'favorite crypto, crypto tracking, favorites'
      }
    },
    news: {
      tr: {
        title: 'Kriptotek - Kripto Haberler',
        description: 'Kripto para dünyasından son haberler ve analizler. Güncel kripto haberleri okuyun.',
        keywords: 'kripto haberler, bitcoin haber, ethereum haber, kripto haberleri'
      },
      en: {
        title: 'Kriptotek - Crypto News',
        description: 'Latest news and analysis from the crypto world. Read current cryptocurrency news.',
        keywords: 'crypto news, bitcoin news, ethereum news, cryptocurrency news'
      }
    },
    fedRate: {
      tr: {
        title: 'Kriptotek - Fed Faiz Oranı',
        description: 'Fed faiz oranı takibi ve kripto piyasasına etkileri. Güncel Fed kararları ve analizler.',
        keywords: 'fed faiz oranı, fed rate, kripto piyasa, faiz oranı'
      },
      en: {
        title: 'Kriptotek - Fed Interest Rate',
        description: 'Track Fed interest rates and their impact on the crypto market. Current Fed decisions and analysis.',
        keywords: 'fed interest rate, fed rate, crypto market, interest rate'
      }
    },
    supplyTracking: {
      tr: {
        title: 'Kriptotek - Arz Takibi',
        description: 'Kripto paraların arz takibi ve analizi. Bitcoin, Ethereum ve diğer coinlerin arz verileri.',
        keywords: 'kripto arz, bitcoin arz, ethereum arz, arz takibi'
      },
      en: {
        title: 'Kriptotek - Supply Tracking',
        description: 'Track and analyze cryptocurrency supply. Supply data for Bitcoin, Ethereum, and other coins.',
        keywords: 'crypto supply, bitcoin supply, ethereum supply, supply tracking'
      }
    },
    settings: {
      tr: {
        title: 'Kriptotek - Ayarlar',
        description: 'Kriptotek hesap ayarlarınızı yönetin. Dil, tema ve diğer tercihlerinizi düzenleyin.',
        keywords: 'ayarlar, hesap ayarları, tercihler'
      },
      en: {
        title: 'Kriptotek - Settings',
        description: 'Manage your Kriptotek account settings. Edit language, theme, and other preferences.',
        keywords: 'settings, account settings, preferences'
      }
    },
    admin: {
      tr: {
        title: 'Kriptotek - Yönetim Paneli',
        description: 'Kriptotek yönetim paneli - sistem yönetimi ve kullanıcı yönetimi.',
        keywords: 'yönetim paneli, admin, sistem yönetimi'
      },
      en: {
        title: 'Kriptotek - Admin Panel',
        description: 'Kriptotek admin panel - system management and user management.',
        keywords: 'admin panel, admin, system management'
      }
    },
    portfolio: {
      tr: {
        title: 'Kriptotek - Portföy',
        description: 'Kripto para pozisyonlarınızı takip edin ve kar/zarar hesaplayın. Profesyonel portföy yönetimi.',
        keywords: 'kripto portföy, portföy takip, kar zarar, pozisyon takip'
      },
      en: {
        title: 'Kriptotek - Portfolio',
        description: 'Track your cryptocurrency positions and calculate profit/loss. Professional portfolio management.',
        keywords: 'crypto portfolio, portfolio tracking, profit loss, position tracking'
      }
    },
    notFound: {
      tr: {
        title: 'Kriptotek - Sayfa Bulunamadı',
        description: 'Aradığınız sayfa bulunamadı.',
        keywords: 'sayfa bulunamadı, 404'
      },
      en: {
        title: 'Kriptotek - Page Not Found',
        description: 'The page you are looking for was not found.',
        keywords: 'page not found, 404'
      }
    }
  }

  const lang = language || 'tr'
  const config = pageConfigs[page] || pageConfigs.home
  const pageData = config[lang] || config.tr
  
  const baseUrl = getBaseUrl()
  const pageUrl = getPageUrl(page)
  const imageUrl = `${baseUrl}/kriptotek.jpg`

  // Title
  document.title = pageData.title

  // Remove existing meta tags
  const existingMetaTags = document.querySelectorAll('meta[data-dynamic-seo]')
  existingMetaTags.forEach(tag => tag.remove())

  // Create and add meta tags
  const createMetaTag = (property, content, isProperty = false) => {
    const meta = document.createElement('meta')
    if (isProperty) {
      meta.setAttribute('property', property)
    } else {
      meta.setAttribute('name', property)
    }
    meta.setAttribute('content', content)
    meta.setAttribute('data-dynamic-seo', 'true')
    return meta
  }

  const head = document.head

  // Basic SEO
  head.appendChild(createMetaTag('description', pageData.description))
  head.appendChild(createMetaTag('keywords', pageData.keywords))
  head.appendChild(createMetaTag('robots', 'index, follow'))
  head.appendChild(createMetaTag('language', lang === 'tr' ? 'Turkish' : 'English'))

  // Open Graph (Facebook, LinkedIn, etc.)
  head.appendChild(createMetaTag('og:title', pageData.title, true))
  head.appendChild(createMetaTag('og:description', pageData.description, true))
  head.appendChild(createMetaTag('og:url', pageUrl, true))
  head.appendChild(createMetaTag('og:type', 'website', true))
  head.appendChild(createMetaTag('og:image', imageUrl, true))
  head.appendChild(createMetaTag('og:site_name', 'Kriptotek', true))
  head.appendChild(createMetaTag('og:locale', lang === 'tr' ? 'tr_TR' : 'en_US', true))

  // Twitter Card
  head.appendChild(createMetaTag('twitter:card', 'summary_large_image'))
  head.appendChild(createMetaTag('twitter:title', pageData.title))
  head.appendChild(createMetaTag('twitter:description', pageData.description))
  head.appendChild(createMetaTag('twitter:image', imageUrl))

  // Canonical URL
  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    head.appendChild(canonical)
  }
  canonical.setAttribute('href', pageUrl)

  // HTML lang attribute
  document.documentElement.lang = lang
}


