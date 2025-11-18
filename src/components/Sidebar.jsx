import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { 
  BarChart3, 
  TrendingUp, 
  PieChart, 
  Settings, 
  Home,
  Star,
  Wallet,
  Lock,
  Newspaper,
  Activity,
  DollarSign,
  ShieldCheck,
  Map
} from 'lucide-react'

const Sidebar = ({ onItemClick }) => {
  const { t } = useLanguage()
  const { user, isAdmin, isPremium } = useAuth()
  const navigate = useNavigate()
  
  const navItems = [
    { to: '/', icon: Home, label: t('home'), isPremium: false, isAdmin: false },
    { to: '/market-overview', icon: PieChart, label: t('marketOverview'), isPremium: true, isAdmin: false },
    { to: '/supply-tracking', icon: Activity, label: t('supplyTracking'), isPremium: true, isAdmin: false },
    { to: '/fed-rate', icon: DollarSign, label: t('fedRateTracking'), isPremium: true, isAdmin: false },
    { to: '/news', icon: Newspaper, label: t('news'), isPremium: false, isAdmin: false },
    { to: '/trending', icon: TrendingUp, label: t('trending'), isPremium: true, isAdmin: false },
    { to: '/favorites', icon: Star, label: t('favorites'), isPremium: true, isAdmin: false },
    { to: '/settings', icon: Settings, label: t('settings'), isPremium: false, isAdmin: false },
    { to: '/admin', icon: ShieldCheck, label: t('admin'), isPremium: false, isAdmin: true },
  ]

  const handleItemClick = (e, item) => {
    const isLocked = item.isPremium && !isPremium && !isAdmin
    
    if (isLocked) {
      e.preventDefault()
      navigate(item.to)
      if (onItemClick) onItemClick()
    } else {
      if (onItemClick) onItemClick()
    }
  }

  return (
    <aside className="w-full h-full bg-white dark:bg-gray-800 shadow-sm border-r border-gray-200 dark:border-gray-700">
      <nav className="p-3 sm:p-4">
        <ul className="space-y-2">
          {navItems.map((item) => {
            if (item.isAdmin && !isAdmin) {
              return null
            }
            
            const isLocked = item.isPremium && !isPremium && !isAdmin
            
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={(e) => handleItemClick(e, item)}
                  className={({ isActive }) =>
                    `flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
                        : isLocked
                        ? 'text-gray-400 hover:bg-gray-50 dark:text-gray-500 dark:hover:bg-gray-750 cursor-pointer'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <div className="flex items-center space-x-2 sm:space-x-3">
                    <item.icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="font-medium text-sm sm:text-base">{item.label}</span>
                  </div>
                  {isLocked && (
                    <Lock className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-500" />
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

export default Sidebar

