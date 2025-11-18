import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dominance from './pages/Dominance'
import Admin from './pages/Admin'
import Settings from './pages/Settings'
import Trending from './pages/Trending'
import Favorites from './pages/Favorites'
import NotFound from './pages/NotFound'
import PremiumRoute from './components/PremiumRoute'
import { useAuth } from './contexts/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  
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
              <div className="p-8">
                <h1 className="text-2xl font-bold">Supply Tracking</h1>
                <p className="mt-4">Premium özellik - Yakında...</p>
              </div>
            </PremiumRoute>
          }
        />
        <Route
          path="fed-rate"
          element={
            <PremiumRoute>
              <div className="p-8">
                <h1 className="text-2xl font-bold">Fed Rate Tracking</h1>
                <p className="mt-4">Premium özellik - Yakında...</p>
              </div>
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
  )
}

export default App


