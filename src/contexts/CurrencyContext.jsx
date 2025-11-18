import React, { createContext, useContext, useState, useEffect } from 'react'

const CurrencyContext = createContext(null)

export const CurrencyProvider = ({ children }) => {
  const [currency, setCurrency] = useState(() => {
    const saved = localStorage.getItem('currency')
    return saved || 'USD'
  })

  useEffect(() => {
    localStorage.setItem('currency', currency)
  }, [currency])

  // MongoDB'den gelen currency değişikliklerini dinle
  useEffect(() => {
    const handleCurrencyChange = (event) => {
      const newCurrency = event.detail
      setCurrency(newCurrency)
    }
    
    window.addEventListener('currencyChanged', handleCurrencyChange)
    return () => window.removeEventListener('currencyChanged', handleCurrencyChange)
  }, [])

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider')
  }
  return context
}

