export const updatePageSEO = (page, language) => {
  const titleMap = {
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
    }
  }

  const lang = language || 'tr'
  const pageConfig = titleMap[page] || titleMap.login
  const title = pageConfig[lang] || pageConfig.tr

  document.title = title
}


