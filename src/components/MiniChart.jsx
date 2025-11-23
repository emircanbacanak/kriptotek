import React, { useState, useEffect, useMemo } from 'react'
import Chart from 'react-apexcharts'
import { useTheme } from '../contexts/ThemeContext'
import { useLanguage } from '../contexts/LanguageContext'
import cryptoService from '../services/cryptoService'

const MiniChart = React.memo(function MiniChart({ coinId, coinSymbol, sparklineData, isVisible = false }) {
  const { isDark } = useTheme()
  const { t } = useLanguage()
  const [series, setSeries] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dataFetched, setDataFetched] = useState(false)
  const [xaxisRange, setXaxisRange] = useState(null) // Son 1 haftalık zoom için

  useEffect(() => {
    setDataFetched(false)
    setLoading(false)
    setError(null)
    setSeries([])
    setXaxisRange(null) // Coin değiştiğinde zoom aralığını sıfırla
  }, [coinId])

  useEffect(() => {
    if (isVisible && coinId && !dataFetched) {
      setDataFetched(true)
      setLoading(true)
      setError(null)
    }
  }, [isVisible, coinId, dataFetched])

  useEffect(() => {
    if (!isVisible || !coinId || !dataFetched) {
      return
    }

    let isMounted = true

    const fetchOHLCData = async () => {
      try {
        setLoading(true)
        setError(null)

        const ohlcData = await cryptoService.fetchOHLCData(coinSymbol, coinId)

        if (!isMounted) return

        if (ohlcData && ohlcData.length > 0) {
          // ApexCharts için candlestick formatı: [timestamp, [open, high, low, close]]
          const candleData = ohlcData.map(item => ({
            x: new Date(item.time).getTime(),
            y: [
              parseFloat(item.open),
              parseFloat(item.high),
              parseFloat(item.low),
              parseFloat(item.close)
            ]
          }))

          // Son 1 haftalık zoom için zaman aralığını hesapla
          if (candleData.length > 0) {
            const lastTimestamp = candleData[candleData.length - 1].x
            const oneWeekAgo = lastTimestamp - (7 * 24 * 60 * 60 * 1000) // 7 gün = 604800000 ms
            setXaxisRange({
              min: oneWeekAgo,
              max: lastTimestamp
            })
          }

          setSeries([{
            name: 'Price',
            data: candleData
          }])
          setLoading(false)
        } else {
          setError(t('chartDataUnavailable'))
          setLoading(false)
        }
      } catch (fetchError) {
        if (!isMounted) return
        console.warn(`⚠️ Failed to fetch OHLC data for ${coinId}:`, fetchError.message)
        setError(t('chartDataLoadError'))
        setLoading(false)
      }
    }

    fetchOHLCData()

    return () => {
      isMounted = false
    }
  }, [isVisible, coinId, coinSymbol, dataFetched])

  const options = useMemo(() => ({
    chart: {
      type: 'candlestick',
      height: 300,
      background: '#1a1a1a',
      toolbar: {
        show: true,
        autoSelected: 'pan', // Varsayılan olarak pan (hareket ettirme) seçili
        tools: {
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
          download: false
        }
      },
      zoom: {
        enabled: true,
        type: 'x',
        autoScaleYaxis: true
      },
      pan: {
        enabled: true,
        type: 'x'
      }
    },
    theme: {
      mode: 'dark'
    },
    plotOptions: {
      candlestick: {
        colors: {
          upward: isDark ? '#10B981' : '#059669',
          downward: isDark ? '#EF4444' : '#DC2626'
        },
        wick: {
          useFillColor: true
        }
      }
    },
    xaxis: {
      type: 'datetime',
      min: xaxisRange?.min, // Son 1 haftalık zoom için başlangıç
      max: xaxisRange?.max, // Son 1 haftalık zoom için bitiş
      labels: {
        style: {
          colors: '#888888',
          fontSize: '11px'
        },
        format: 'dd/MM HH:mm'
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#888888',
          fontSize: '11px'
        },
        formatter: (value) => {
          if (value >= 1000) {
            return value.toFixed(0)
          } else if (value >= 1) {
            return value.toFixed(2)
          } else if (value >= 0.01) {
            return value.toFixed(4)
          } else {
            return value.toFixed(6)
          }
        }
      },
      opposite: true
    },
    grid: {
      borderColor: '#2a2a2a',
      strokeDashArray: 0,
      xaxis: {
        lines: {
          show: true,
          color: '#2a2a2a'
        }
      },
      yaxis: {
        lines: {
          show: true,
          color: '#2a2a2a'
        }
      },
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }
    },
    tooltip: {
      theme: 'dark',
      x: {
        format: 'dd/MM/yyyy HH:mm'
      },
      style: {
        fontSize: '12px'
      }
    },
    colors: [isDark ? '#10B981' : '#059669'],
    fill: {
      opacity: 1
    }
  }), [isDark, xaxisRange])

  if (!isVisible) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
        <p className="text-gray-300 text-sm">
          {t('chartClickToView')}
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
        <p className="text-gray-300 text-sm">{error}</p>
      </div>
    )
  }

  if (!series || series.length === 0 || !series[0].data || series[0].data.length === 0) {
    return (
      <div className="w-full h-[300px] flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
        <p className="text-gray-300 text-sm">{t('chartDataLoading')}</p>
      </div>
    )
  }

  return (
    <div className="w-full h-[300px]" style={{ backgroundColor: '#1a1a1a' }}>
      <Chart
        options={options}
        series={series}
        type="candlestick"
        height={300}
      />
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.coinId === nextProps.coinId &&
    prevProps.coinSymbol === nextProps.coinSymbol &&
    prevProps.isVisible === nextProps.isVisible &&
    prevProps.sparklineData === nextProps.sparklineData
  )
})

export default MiniChart
