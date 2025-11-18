import React, { useState } from 'react'

const CryptoIcon = ({ 
  src, 
  alt, 
  className = 'w-8 h-8 rounded-full',
  fallbackClassName = 'w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs font-bold'
}) => {
  const [imgError, setImgError] = useState(false)
  const [imgSrc, setImgSrc] = useState(src)

  const handleError = () => {
    if (!imgError && imgSrc === src) {
      // İlk hata - alternatif URL dene
      const symbol = alt?.toLowerCase() || 'btc'
      // CryptoIcons API kullan
      const alternativeUrl = `https://cryptoicons.org/api/icon/${symbol}/200`
      setImgSrc(alternativeUrl)
    } else {
      // Tüm alternatifler denendi, fallback göster
      setImgError(true)
    }
  }

  if (imgError || !imgSrc) {
    // Fallback: İlk harf veya sembol
    const displayText = alt?.charAt(0)?.toUpperCase() || '?'
    return (
      <div className={fallbackClassName}>
        {displayText}
      </div>
    )
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={handleError}
      referrerPolicy="no-referrer"
      loading="lazy"
    />
  )
}

export default CryptoIcon

