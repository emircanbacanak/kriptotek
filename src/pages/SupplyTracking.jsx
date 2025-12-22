import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import useSupplyTrackingData from '../hooks/useSupplyTrackingData';
import useCryptoData from '../hooks/useCryptoData';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { formatLargeNumber } from '../utils/currencyConverter';
import { TrendingUp, TrendingDown, Activity, Minus, Search as SearchIcon } from 'lucide-react';
import { updatePageSEO } from '../utils/seoMetaTags';

const SUPPLY_CACHE_KEY = 'supply_tracking_cache';
const SUPPLY_CACHE_TIME_KEY = `${SUPPLY_CACHE_KEY}_time`;

function SupplyTracking() {
  const { t, language } = useLanguage();
  const { theme } = useTheme();

  // Global veri yönetim sisteminden verileri al
  const { supplyTrackingData, loading: globalSupplyLoading, isUpdating: globalSupplyUpdating } = useSupplyTrackingData();
  const { coins, loading: globalCoinsLoading } = useCryptoData();

  const [supplyData, setSupplyData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('default');
  const latestSupplyRef = useRef({});
  const cachedCoinsRef = useRef([]);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    updatePageSEO('supplyTracking', language);
  }, [language]);

  const persistSupplyCache = useCallback((supplyChanges) => {
    if (!supplyChanges || typeof supplyChanges !== 'object') return;
    try {
      localStorage.setItem(SUPPLY_CACHE_KEY, JSON.stringify(supplyChanges));
      localStorage.setItem(SUPPLY_CACHE_TIME_KEY, Date.now().toString());
    } catch (error) {
      console.warn('Supply cache yazma hatası:', error?.message || error);
    }
  }, []);

  const mergeAndSetData = useCallback(async (supplyChanges = {}, coinsOverride = null) => {
    if (!supplyChanges || typeof supplyChanges !== 'object') {
      supplyChanges = {};
    }

    latestSupplyRef.current = supplyChanges;

    let coins = Array.isArray(coinsOverride) && coinsOverride.length > 0 ? coinsOverride : cachedCoinsRef.current;

    // Önce firestoreCacheService'den crypto_list'i al
    if (!Array.isArray(coins) || coins.length === 0) {
      try {
        const cryptoListData = await firestoreCacheService.getIgnoringExpiry('crypto_list');
        if (cryptoListData && cryptoListData.data) {
          const cryptoList = cryptoListData.data.coins || cryptoListData.data.data?.coins || cryptoListData.data;
          if (Array.isArray(cryptoList) && cryptoList.length > 0) {
            coins = cryptoList;
          }
        }
      } catch (error) {
        console.warn('SupplyTracking firestore cache hatası:', error?.message || error);
      }
    }

    // Hala yoksa cryptoService'den çek
    if (!Array.isArray(coins) || coins.length === 0) {
      try {
        const fresh = await cryptoService.fetchCryptoList();
        if (fresh && Array.isArray(fresh) && fresh.length > 0) {
          coins = fresh;
        }
      } catch (error) {
        console.warn('SupplyTracking coin list fallback başarısız:', error?.message || error);
      }
    }

    if (!Array.isArray(coins)) {
      coins = [];
    }

    cachedCoinsRef.current = coins;

    // Debug: İlk birkaç coin için total_supply ve max_supply kontrolü
    if (coins.length > 0) {
      const sampleCoin = coins[0];
    }

    // Debug: İlk birkaç coin için total_supply ve max_supply kontrolü
    if (coins.length > 0) {
      const sampleCoin = coins[0];
      const coinsWithTotalSupply = coins.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
      const coinsWithMaxSupply = coins.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;
    }

    // Debug: Supply tracking değişim verilerini kontrol et
    const supplyChangesKeys = Object.keys(supplyChanges || {});
    if (supplyChangesKeys.length > 0) {
      const sampleCoinId = supplyChangesKeys[0];
      const sampleSupplyInfo = supplyChanges[sampleCoinId];
    } else {
    }

    const enrichedCoins = coins.map((coin) => {
      const supplyInfo = supplyChanges[coin.id] || {};

      // Supply bilgilerini öncelik sırasına göre belirle
      // 1. Coin objesinden (backend'den geliyor)
      // 2. Yoksa null
      const totalSupply = coin.total_supply !== null && coin.total_supply !== undefined ? coin.total_supply : null;
      const maxSupply = coin.max_supply !== null && coin.max_supply !== undefined ? coin.max_supply : null;

      // Supply değişim bilgilerini al (backend'den gelen format: change24h, absoluteChange24h, etc.)
      const change24h = supplyInfo.change24h !== undefined ? supplyInfo.change24h : null;
      const absoluteChange24h = supplyInfo.absoluteChange24h !== undefined ? supplyInfo.absoluteChange24h : null;
      const change7d = supplyInfo.change7d !== undefined ? supplyInfo.change7d : null;
      const absoluteChange7d = supplyInfo.absoluteChange7d !== undefined ? supplyInfo.absoluteChange7d : null;
      const change1m = supplyInfo.change1m !== undefined ? supplyInfo.change1m : null;
      const absoluteChange1m = supplyInfo.absoluteChange1m !== undefined ? supplyInfo.absoluteChange1m : null;

      return {
        ...coin,
        // Supply değişim bilgileri (açıkça set et)
        supply_change_24h: change24h,
        supply_absolute_change_24h: absoluteChange24h,
        supply_change_7d: change7d,
        supply_absolute_change_7d: absoluteChange7d,
        supply_change_1m: change1m,
        supply_absolute_change_1m: absoluteChange1m,
        // Supply bilgileri (açıkça set et - spread operator'dan sonra tekrar set et ki kaybolmasın)
        total_supply: totalSupply,
        max_supply: maxSupply,
      };
    });

    // Debug: Kaç coin'de supply bilgisi var?
    const coinsWithTotalSupply = enrichedCoins.filter(c => c.total_supply !== null && c.total_supply !== undefined).length;
    const coinsWithMaxSupply = enrichedCoins.filter(c => c.max_supply !== null && c.max_supply !== undefined).length;

    if (!isMountedRef.current) return;

    setSupplyData(enrichedCoins);
    setLoading(false);
  }, []);

  // Global veri yönetim sisteminden gelen veriyi kullan
  useEffect(() => {
    // Coins varsa her zaman göster
    if (coins && coins.length > 0) {
      cachedCoinsRef.current = coins;

      let trackingData = supplyTrackingData;

      // Yeni veri varsa kullan ve cache'le
      if (trackingData && Object.keys(trackingData).length > 0) {
        latestSupplyRef.current = trackingData;
        // Başarılı veriyi localStorage'a cache'le
        persistSupplyCache(trackingData);
        mergeAndSetData(trackingData, coins);
      } else {
        // Yeni veri yoksa, ÖNCEKİ cache'i kullan (localStorage'dan)
        try {
          const cachedData = localStorage.getItem(SUPPLY_CACHE_KEY);
          if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (parsed && Object.keys(parsed).length > 0) {
              console.log('📦 Supply tracking: LocalStorage cache kullanılıyor (yeni veri yok)');
              trackingData = parsed;
              latestSupplyRef.current = trackingData;
            }
          }
        } catch (error) {
          console.warn('Supply cache okuma hatası:', error?.message || error);
        }
        mergeAndSetData(trackingData || {}, coins);
      }
      setLoading(false);
    } else if (!globalSupplyLoading && !globalCoinsLoading) {
      // Coins bile yoksa loading'i kapat
      setLoading(false);
    }
  }, [supplyTrackingData, coins, globalSupplyLoading, globalCoinsLoading, mergeAndSetData, persistSupplyCache]);

  // Header gradients (Light: blue→indigo, Dark: yellow→orange) - same as Home page
  const headerIconGradient = useMemo(() => {
    return theme === 'dark'
      ? 'from-yellow-600 to-orange-600'
      : 'from-blue-500 to-indigo-500';
  }, [theme]);

  const headerTextGradient = useMemo(() => {
    return theme === 'dark'
      ? 'from-yellow-400 to-orange-400'
      : 'from-blue-600 to-indigo-600';
  }, [theme]);

  const formatSupplyChange = (change) => {
    if (change === null || change === undefined) return '-';
    const sign = change >= 0 ? '+' : '';
    // Mutlak değer olarak formatla (sayı biçiminde)
    const absValue = Math.abs(change);
    if (absValue >= 1e9) {
      return `${sign}${(absValue / 1e9).toFixed(2)}B`;
    } else if (absValue >= 1e6) {
      return `${sign}${(absValue / 1e6).toFixed(2)}M`;
    } else {
      // Binler için tam sayı olarak göster (2.19K değil 2190 gibi)
      return `${sign}${absValue.toLocaleString()}`;
    }
  };

  const getSupplyChangeColor = (change) => {
    if (change === null || change === undefined) return 'text-gray-400';
    if (change === 0) return 'text-gray-500 dark:text-gray-400';
    return change > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const getSupplyChangeIcon = (change) => {
    if (change === null || change === undefined) return null;
    if (change === 0) return <Minus className="w-3 h-3 inline ml-1" />;
    return change > 0 ? <TrendingUp className="w-3 h-3 inline ml-1" /> : <TrendingDown className="w-3 h-3 inline ml-1" />;
  };

  const getWordCount = (name) => {
    return name.split(' ').filter(word => word.length > 0).length;
  };

  const getDisplayName = (name, symbol) => {
    const wordCount = getWordCount(name);
    return wordCount > 3 ? symbol : name;
  };

  const shouldShowSymbol = (name) => {
    return getWordCount(name) <= 3;
  };

  const filteredSupplyData = useMemo(() => {
    if (!Array.isArray(supplyData) || supplyData.length === 0) return [];

    const term = searchTerm.trim().toLowerCase();
    const base = term
      ? supplyData.filter((coin) => {
        const name = coin.name?.toLowerCase() || '';
        const symbol = coin.symbol?.toLowerCase() || '';
        return name.includes(term) || symbol.includes(term);
      })
      : supplyData;

    const sorted = [...base];
    const getMetric = (coin, key) => {
      const value = coin[key];
      return value === null || value === undefined ? Number.NEGATIVE_INFINITY : value;
    };

    switch (sortOption) {
      case 'name':
        sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
        break;
      case 'change24h':
        sorted.sort((a, b) => getMetric(b, 'supply_absolute_change_24h') - getMetric(a, 'supply_absolute_change_24h'));
        break;
      case 'change7d':
        sorted.sort((a, b) => getMetric(b, 'supply_absolute_change_7d') - getMetric(a, 'supply_absolute_change_7d'));
        break;
      case 'change1m':
        sorted.sort((a, b) => getMetric(b, 'supply_absolute_change_1m') - getMetric(a, 'supply_absolute_change_1m'));
        break;
      case 'default':
      default:
        sorted.sort((a, b) => {
          const rankA = a.market_cap_rank ?? Number.POSITIVE_INFINITY;
          const rankB = b.market_cap_rank ?? Number.POSITIVE_INFINITY;
          return rankA - rankB;
        });
        break;
    }

    return sorted;
  }, [supplyData, searchTerm, sortOption]);

  // Infinite scroll hook
  const {
    visibleItems: visibleSupplyData,
    hasMore,
    loadingMore,
    sentinelRef,
    visibleCount,
    totalCount
  } = useInfiniteScroll(filteredSupplyData, {
    initialCount: 30,
    incrementCount: 15,
    threshold: 100
  });

  const handleSortChange = (event) => {
    setSortOption(event.target.value);
  };

  // Loading timeout - 5 saniye sonra sayfayı göster (veri gelmese bile)
  const [showLoading, setShowLoading] = useState(true)
  useEffect(() => {
    if (!loading || (supplyData && supplyData.length > 0) || (coins && coins.length > 0)) {
      setShowLoading(false)
      return
    }
    const timeoutId = setTimeout(() => {
      setShowLoading(false)
    }, 5000) // 5 saniye sonra loading'i kapat
    return () => clearTimeout(timeoutId)
  }, [loading, supplyData, coins])

  if (showLoading && loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 w-full py-4 sm:py-8">
        <div className="flex items-center justify-center py-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-primary-500 dark:border-primary-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 w-full py-4 sm:py-8">
      {/* Header */}
      <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8 animate-fade-in">
        <div className={`w-8 h-8 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-gradient-to-br ${headerIconGradient} rounded-xl flex items-center justify-center shadow-lg transform transition-all duration-300 hover:scale-110`}>
          <Activity className="w-4 h-4 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
        </div>
        <div>
          <h1 className={`text-xl sm:text-2xl lg:text-3xl xl:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r ${headerTextGradient}`}>
            {t('supplyTracking')}
          </h1>
          <p className="text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400 mt-2 animate-pulse">
            Sistem 5 dk da bir güncellenmektedir ⚡
          </p>
        </div>
      </div>

      {/* Data Table - Modern Card Grid */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 ">
        <div className="relative w-full sm:max-w-xs pl-6 sm:pl-6">
          <SearchIcon className="absolute left-9 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 " />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t('supplySearchPlaceholder')}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400 transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 sm:pr-12">
          <label htmlFor="supply-sort" className="text-sm font-medium text-gray-600 dark:text-gray-300">
            {t('supplySortLabel')}:
          </label>
          <select
            id="supply-sort"
            value={sortOption}
            onChange={handleSortChange}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/80 text-gray-900 dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-400"
          >
            <option value="default">{t('supplySortDefault')}</option>
            <option value="name">{t('supplySortName')}</option>
            <option value="change24h">{t('supplySortChange24h')}</option>
            <option value="change7d">{t('supplySortChange7d')}</option>
            <option value="change1m">{t('supplySortChange1m')}</option>
          </select>
        </div>
      </div>

      {filteredSupplyData.length === 0 ? (
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center shadow-lg">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <SearchIcon className="w-6 h-6 text-gray-500 dark:text-gray-300" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {searchTerm ? t('noResultsFor', { searchTerm: `"${searchTerm}"` }) : t('noSupplyData')}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[1921px]:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 overflow-y-auto max-h-[750px] min-[1921px]:max-h-[1100px] pt-4 sm:pt-6 pb-6 px-4 crypto-list-scrollbar">
          {visibleSupplyData.map((coin, index) => (
            <div key={coin.id} className="group/card relative z-10">
              <div className="absolute inset-0 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl opacity-0 group-hover/card:opacity-50 blur-md transition-opacity duration-300"></div>
              <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl p-4 sm:p-5 shadow-lg transform transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                {/* Header: Icon, Name, Rank */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="relative flex-shrink-0">
                      <img
                        className="h-10 w-10 sm:h-12 sm:w-12 rounded-full transition-transform duration-300 group-hover/card:scale-110 group-hover/card:rotate-6"
                        src={coin.image}
                        alt={coin.name}
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs font-bold">#{coin.market_cap_rank}</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-base sm:text-lg text-gray-900 dark:text-white truncate">
                        {getDisplayName(coin.name, coin.symbol)}
                      </h2>
                      {shouldShowSymbol(coin.name) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {coin.symbol}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Supply Changes: 24h, 7d, 1m */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg transition-transform duration-300 group-hover/card:scale-105">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('supplyChange24h')}</span>
                    <div className={`flex items-center font-bold ${getSupplyChangeColor(coin.supply_absolute_change_24h)}`}>
                      {coin.supply_absolute_change_24h === null || coin.supply_absolute_change_24h === undefined ? '-' : formatSupplyChange(coin.supply_absolute_change_24h)}
                      {coin.supply_absolute_change_24h !== null && coin.supply_absolute_change_24h !== undefined && getSupplyChangeIcon(coin.supply_absolute_change_24h)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg transition-transform duration-300 group-hover/card:scale-105">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('supplyChange7d')}</span>
                    <div className={`flex items-center font-bold ${getSupplyChangeColor(coin.supply_absolute_change_7d)}`}>
                      {coin.supply_absolute_change_7d === null || coin.supply_absolute_change_7d === undefined ? '-' : formatSupplyChange(coin.supply_absolute_change_7d)}
                      {coin.supply_absolute_change_7d !== null && coin.supply_absolute_change_7d !== undefined && getSupplyChangeIcon(coin.supply_absolute_change_7d)}
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg transition-transform duration-300 group-hover/card:scale-105">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('supplyChange30d')}</span>
                    <div className={`flex items-center font-bold ${getSupplyChangeColor(coin.supply_absolute_change_1m)}`}>
                      {coin.supply_absolute_change_1m === null || coin.supply_absolute_change_1m === undefined ? '-' : formatSupplyChange(coin.supply_absolute_change_1m)}
                      {coin.supply_absolute_change_1m !== null && coin.supply_absolute_change_1m !== undefined && getSupplyChangeIcon(coin.supply_absolute_change_1m)}
                    </div>
                  </div>
                </div>

                {/* Supply Stats */}
                <div className="space-y-2 pt-3 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('circulatingSupplyFull')}</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white text-right">
                      {coin.circulating_supply ? formatLargeNumber(coin.circulating_supply, '', true) : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('totalSupplyFull')}</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white text-right">
                      {coin.total_supply ? formatLargeNumber(coin.total_supply, '', true) : '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('maxSupplyFull')}</span>
                    <span className="text-xs font-semibold text-gray-900 dark:text-white text-right">
                      {coin.max_supply ? formatLargeNumber(coin.max_supply, '', true) : '∞'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Infinite Scroll Sentinel */}
          {hasMore && (
            <div ref={sentinelRef} id="supply-scroll-sentinel" className="col-span-full flex justify-center py-6">
              {loadingMore ? (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-green-500 dark:border-t-green-400 rounded-full animate-spin"></div>
                  <span className="text-sm">Yükleniyor...</span>
                </div>
              ) : (
                <div className="text-sm text-gray-400 dark:text-gray-500">
                  {visibleCount} / {totalCount} coin
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SupplyTracking;

