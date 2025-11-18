import React, { useState, Suspense, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useLanguage } from '../contexts/LanguageContext';
import globalDataManager from '../managers/globalDataManager';

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { t } = useLanguage();

  // GlobalDataManager'ı başlat (sayfa açık olmasa bile çalışır)
  useEffect(() => {
    globalDataManager.startAutoUpdate();
    
    // Cleanup: Component unmount olduğunda durdur
    return () => {
      globalDataManager.stopAutoUpdate();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-blue-900/30 dark:to-indigo-900/30">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} className="flex-shrink-0 z-20" />

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block w-64 flex-shrink-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl border-r border-gray-200 dark:border-gray-700">
          <Sidebar />
        </div>

        <main className="flex-1 overflow-y-auto hide-scrollbar" data-scroll-container>
          <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-8 animate-fade-in">
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

