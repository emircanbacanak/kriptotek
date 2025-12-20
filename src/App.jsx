import React, { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

// Lazy loaded pages - Code splitting for better performance
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Home = lazy(() => import('./pages/Home'))
const Dominance = lazy(() => import('./pages/Dominance'))
const Admin = lazy(() => import('./pages/Admin'))
const Settings = lazy(() => import('./pages/Settings'))
const Trending = lazy(() => import('./pages/Trending'))
const Favorites = lazy(() => import('./pages/Favorites'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const News = lazy(() => import('./pages/News'))
const FedRate = lazy(() => import('./pages/FedRate'))
const SupplyTracking = lazy(() => import('./pages/SupplyTracking'))
const WhaleTracking = lazy(() => import('./pages/WhaleTracking'))
const NotFound = lazy(() => import('./pages/NotFound'))

// Non-lazy imports (always needed)
import Layout from './components/Layout'
import PremiumRoute from './components/PremiumRoute'
import { useAuth } from './contexts/AuthContext'
import './services/supplyHistoryService' // Supply history service'i yükle (window'a ekler)

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
  </div>
)

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isActive, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Yükleniyor...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Pasif kullanıcı kontrolü - Bildirim componenti Layout'ta çalışacak, burada sadece içeriği gösterme
  // Bildirim componenti geri sayım yapıp logout yapacak
  if (isActive === false) {
    // Bildirim componenti Layout'ta gösterilecek, burada sadece boş bir div döndür
    return <div>{children}</div>
  }

  return children
}

const AdminRoute = ({ children }) => {
  const { isAuthenticated, isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Yükleniyor...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}

const App = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes - no layout */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected routes - with layout */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Home />} />
          {/* Premium routes - inside Layout */}
          <Route
            path="market-overview"
            element={
              <PremiumRoute>
                <Dominance />
              </PremiumRoute>
            }
          />
          <Route
            path="supply-tracking"
            element={
              <PremiumRoute>
                <SupplyTracking />
              </PremiumRoute>
            }
          />
          <Route
            path="fed-rate"
            element={
              <PremiumRoute>
                <FedRate />
              </PremiumRoute>
            }
          />
          <Route
            path="trending"
            element={
              <PremiumRoute>
                <Trending />
              </PremiumRoute>
            }
          />
          <Route
            path="favorites"
            element={
              <PremiumRoute>
                <Favorites />
              </PremiumRoute>
            }
          />
          <Route
            path="portfolio"
            element={
              <PremiumRoute>
                <Portfolio />
              </PremiumRoute>
            }
          />
          <Route
            path="news"
            element={
              <PremiumRoute>
                <News />
              </PremiumRoute>
            }
          />
          <Route
            path="whale-tracking"
            element={
              <PremiumRoute>
                <WhaleTracking />
              </PremiumRoute>
            }
          />
          {/* Settings route */}
          <Route path="settings" element={<Settings />} />
          {/* Admin route - sadece admin kullanıcılar erişebilir */}
          <Route
            path="admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          {/* Add more protected routes here */}
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default App
