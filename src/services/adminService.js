/**
 * Admin Service - MongoDB Backend API
 * Tüm admin işlemleri backend API üzerinden MongoDB'ye yapılır
 */

const API_URL = import.meta.env.VITE_MONGO_API_URL || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000'

/**
 * Admin bilgisini deşifre et
 */
const decryptAdmin = async (adminEncrypted) => {
  if (!adminEncrypted) return false
  
  try {
    const { decryptAES } = await import('../utils/advancedSecurity')
    const adminData = decryptAES(adminEncrypted)
    
    // decryptAES null dönerse false döndür
    if (adminData === null || adminData === undefined) {
      return false
    }
    
    return adminData === true
  } catch (error) {
    // Hata durumunda false döndür (sessizce)
    return false
  }
}

/**
 * Tüm kullanıcıları getir
 */
export const getAllUsers = async () => {
  try {
    const response = await fetch(`${API_URL}/api/admin/users`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Backend API error: ${response.status}`)
    }

    const result = await response.json()
    
    if (result.success && result.users) {
      // Admin bilgisini deşifre et
      const usersWithDecryptedAdmin = await Promise.all(
        result.users.map(async (user) => {
          const isAdmin = await decryptAdmin(user.adminEncrypted)
          return {
            ...user,
            isAdmin
          }
        })
      )
      
      return {
        success: true,
        users: usersWithDecryptedAdmin
      }
    }
    
    return {
      success: false,
      error: 'Kullanıcılar getirilemedi',
      users: []
    }
  } catch (error) {
    console.error('❌ Kullanıcı listesi getirilemedi:', error)
    return {
      success: false,
      error: error.message,
      users: []
    }
  }
}

/**
 * Kullanıcıyı pasif et
 */
export const deactivateUser = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/active`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isActive: false })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      success: result.success,
      message: result.message || 'Kullanıcı başarıyla pasif edildi',
      error: result.error
    }
  } catch (error) {
    console.error('❌ Kullanıcı pasif edilemedi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcıyı aktif et
 */
export const activateUser = async (userId) => {
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/active`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isActive: true })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      success: result.success,
      message: result.message || 'Kullanıcı başarıyla aktif edildi',
      error: result.error
    }
  } catch (error) {
    console.error('❌ Kullanıcı aktif edilemedi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Premium durumunu değiştir
 */
export const toggleUserPremium = async (userId, isPremium) => {
  try {
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/premium`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isPremium })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      success: result.success,
      message: result.message || `Kullanıcı ${isPremium ? 'premium' : 'ücretsiz'} olarak güncellendi`,
      error: result.error
    }
  } catch (error) {
    console.error('❌ Premium durumu değiştirilemedi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcıyı admin yap
 */
export const setUserAsAdmin = async (userId, isAdmin) => {
  try {
    // Admin yapılacaksa şifrele
    let adminEncrypted = null
    if (isAdmin) {
      const { encryptAES } = await import('../utils/advancedSecurity')
      adminEncrypted = encryptAES(true)
    }
    
    const response = await fetch(`${API_URL}/api/admin/users/${userId}/admin`, {
      method: 'PATCH',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        isAdmin,
        adminEncrypted 
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      success: result.success,
      message: result.message || `Kullanıcı ${isAdmin ? 'admin' : 'normal'} olarak güncellendi`,
      error: result.error
    }
  } catch (error) {
    console.error('❌ Admin durumu değiştirilemedi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcı bilgilerini güncelle
 */
export const updateUserInfo = async (userId, userData) => {
  try {
    const response = await fetch(`${API_URL}/api/user-settings/${userId}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...userData,
        updatedAt: Date.now()
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      success: result.success,
      message: result.message || 'Kullanıcı bilgileri güncellendi',
      error: result.error
    }
  } catch (error) {
    console.error('❌ Kullanıcı bilgileri güncellenemedi:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Kullanıcı arama (email, displayName'e göre)
 */
export const searchUsers = async (searchTerm) => {
  try {
    const result = await getAllUsers()
    
    if (!result.success) {
      return result
    }
    
    const searchLower = searchTerm.toLowerCase()
    const filteredUsers = result.users.filter(user => 
      user.email.toLowerCase().includes(searchLower) ||
      user.displayName.toLowerCase().includes(searchLower) ||
      user.uid.toLowerCase().includes(searchLower)
    )
    
    return {
      success: true,
      users: filteredUsers
    }
  } catch (error) {
    console.error('❌ Kullanıcı arama hatası:', error)
    return {
      success: false,
      error: error.message,
      users: []
    }
  }
}

// Default export
const adminService = {
  getAllUsers,
  deactivateUser,
  activateUser,
  toggleUserPremium,
  setUserAsAdmin,
  updateUserInfo,
  searchUsers
}

export default adminService

