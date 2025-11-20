import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from 'firebase/auth'
import { auth, googleProvider } from './firebaseConfig'

export const loginWithEmailPassword = async (email, password) => {
  try {
    // Email ve password validasyonu
    if (!email || !email.trim()) {
      return { success: false, error: 'Email is required', code: 'auth/invalid-email' }
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters', code: 'auth/weak-password' }
    }
    
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)
    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('❌ Firebase login error:', error.code, error.message)
    return { success: false, error: error.message, code: error.code }
  }
}

export const loginWithGoogleAuth = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    return { success: true, user: result.user }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const registerWithEmailPassword = async (email, password, displayName) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user
    
    // Kullanıcı adını güncelle
    if (displayName) {
      await updateProfile(user, { displayName })
    }
    
    // Email doğrulama gönder
    try {
      await sendEmailVerification(user, {
        url: window.location.origin + '/login?verified=true',
        handleCodeInApp: false
      })
    } catch (verificationError) {
      console.warn('⚠️ Email doğrulama gönderilemedi:', verificationError)
    }
    
    // Kullanıcı bilgilerini yenile
    await user.reload()
    const updatedUser = auth.currentUser
    
    return {
      success: true,
      emailSent: true,
      user: {
        uid: updatedUser.uid,
        email: updatedUser.email,
        displayName: updatedUser.displayName || displayName,
        photoURL: updatedUser.photoURL,
        emailVerified: updatedUser.emailVerified
      }
    }
  } catch (error) {
    return { success: false, error: error.message, code: error.code }
  }
}

export const sendPasswordReset = async (email, messages) => {
  try {
    await sendPasswordResetEmail(auth, email)
    return { success: true, message: messages?.resetPasswordSuccess }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const logout = async () => {
  try {
    await signOut(auth)
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export const onAuthStateChange = (callback) => {
  return onAuthStateChanged(auth, callback)
}

export const resendEmailVerification = async () => {
  try {
    const user = auth.currentUser
    if (!user) {
      return { success: false, error: 'No user logged in' }
    }
    
    await sendEmailVerification(user, {
      url: window.location.origin + '/login?verified=true',
      handleCodeInApp: false
    })
    
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Şifre değiştir
 * @param {string|null} currentPassword - Mevcut şifre (Google kullanıcıları için null)
 * @param {string} newPassword - Yeni şifre
 * @param {Object} translations - Çeviri objesi
 * @returns {Promise<Object>} Sonuç
 */
export const changePassword = async (currentPassword, newPassword, translations = {}) => {
  try {
    const user = auth.currentUser
    if (!user) {
      return { success: false, error: translations.wrongCurrentPassword || 'No user logged in' }
    }

    // Google kullanıcıları için şifre yoksa direkt yeni şifre belirle
    const hasPasswordProvider = user.providerData?.some(provider => provider.providerId === 'password')
    
    if (hasPasswordProvider) {
      // Email/Password kullanıcıları için mevcut şifre ile re-authenticate et
      if (!currentPassword) {
        return { success: false, error: translations.wrongCurrentPassword || 'Current password is required' }
      }

      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
    }

    // Yeni şifreyi güncelle
    await updatePassword(user, newPassword)
    
    return {
      success: true,
      message: translations.passwordChanged || 'Password changed successfully'
    }
  } catch (error) {
    let errorMessage = error.message
    
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMessage = translations.wrongCurrentPassword || 'Current password is incorrect'
    } else if (error.code === 'auth/weak-password') {
      errorMessage = 'Password is too weak'
    } else if (error.code === 'auth/requires-recent-login') {
      errorMessage = 'Please log out and log in again before changing your password'
    }
    
    return { success: false, error: errorMessage }
  }
}

/**
 * Kullanıcı profilini güncelle
 * @param {Object} profileData - Güncellenecek profil verileri
 * @returns {Promise<Object>} Sonuç
 */
export const updateUserProfile = async (profileData) => {
  try {
    const user = auth.currentUser
    if (!user) {
      return { success: false, error: 'No user logged in' }
    }

    await updateProfile(user, profileData)
    await user.reload()
    
    const updatedUser = auth.currentUser
    return {
      success: true,
      user: {
        uid: updatedUser.uid,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        photoURL: updatedUser.photoURL,
        emailVerified: updatedUser.emailVerified,
        providerData: updatedUser.providerData
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * Kullanıcı hesabını sil
 * @param {string|null} password - Şifre (Password provider varsa gerekli)
 * @returns {Promise<Object>} Sonuç
 */
export const deleteUserAccount = async (password = null) => {
  try {
    const user = auth.currentUser
    if (!user) {
      return { success: false, error: 'No user logged in' }
    }

    // Password provider varsa re-authenticate et
    const hasPasswordProvider = user.providerData?.some(provider => provider.providerId === 'password')
    if (hasPasswordProvider && password) {
      const credential = EmailAuthProvider.credential(user.email, password)
      await reauthenticateWithCredential(user, credential)
    }

    // Hesabı sil
    await deleteUser(user)
    
    return { success: true, message: 'Account deleted successfully' }
  } catch (error) {
    let errorMessage = error.message
    
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMessage = 'Password is incorrect'
    } else if (error.code === 'auth/requires-recent-login') {
      errorMessage = 'Please log out and log in again before deleting your account'
    }
    
    return { success: false, error: errorMessage }
  }
}


