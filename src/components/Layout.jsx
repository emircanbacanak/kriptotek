import React, { useState, Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import AccountDeactivationNotification from './AccountDeactivationNotification';
import { useLanguage } from '../contexts/LanguageContext';
import globalDataManager from '../managers/globalDataManager';
import realtimeService from '../services/realtimeService';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useLanguage();
  const location = useLocation();
  const mainRef = useRef(null);

  // Sayfa değiştiğinde scroll pozisyonunu sıfırla
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    // Window scroll da sıfırla (fallback)
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // GlobalDataManager ve RealtimeService'i başlat
  useEffect(() => {
    // GlobalDataManager'ı başlat (sayfa açık olmasa bile çalışır)
    globalDataManager.startAutoUpdate();

    // RealtimeService WebSocket bağlantısını başlat (sadece bir kez)
    // connect() fonksiyonu zaten bağlıysa veya bağlanıyorsa tekrar bağlanmayacak
    if (!realtimeService.isConnected && !realtimeService.isConnecting) {
      realtimeService.connect();
    }

    // Cleanup: Component unmount olduğunda durdur
    // NOT: disconnect() çağrılmasın, diğer sayfalar da kullanıyor olabilir
    return () => {
      globalDataManager.stopAutoUpdate();
      // realtimeService.disconnect(); // Kaldırıldı - diğer sayfalar da kullanıyor
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-900">
      <AccountDeactivationNotification />
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} className="flex-shrink-0 z-20" />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block w-64 flex-shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <Sidebar />
        </div>

        <main ref={mainRef} className="flex-1 overflow-y-auto crypto-list-scrollbar" data-scroll-container>
          <div className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 2xl:px-12 py-4 sm:py-8 animate-fade-in">
            <Suspense fallback={<div className="text-center p-8">{t('loadingPage')}</div>}>
              <Outlet />
            </Suspense>
          </div>
          <Footer />
        </main>
      </div>

      <div
        aria-hidden="true"
        className={`lg:hidden fixed inset-0 top-16 bg-gray-600 bg-opacity-75 transition-opacity z-30 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      <div className={`lg:hidden fixed top-16 left-0 bottom-0 z-40 w-48 bg-white dark:bg-gray-800 transform transition-transform ease-in-out duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onItemClick={() => setSidebarOpen(false)} />
      </div>
    </div>
  );
};

export default Layout;

