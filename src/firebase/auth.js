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
      return { success: false, error: 'E-posta adresi gereklidir', code: 'auth/invalid-email' }
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Şifre en az 6 karakter olmalıdır', code: 'auth/weak-password' }
    }
    
    const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password)
    return { success: true, user: userCredential.user }
  } catch (error) {
    console.error('❌ Firebase login error:', error.code, error.message)
    
    // Hata kodlarına göre kullanıcı dostu Türkçe mesajlar
    let errorMessage = error.message
    const errorCode = error.code
    
    switch (errorCode) {
      case 'auth/user-not-found':
        errorMessage = 'Bu e-posta adresine kayıtlı kullanıcı bulunamadı. Lütfen e-posta adresinizi kontrol edin.'
        break
      case 'auth/wrong-password':
        errorMessage = 'Hatalı şifre. Lütfen şifrenizi kontrol edin.'
        break
      case 'auth/invalid-credential':
        errorMessage = 'E-posta veya şifre hatalı. Lütfen tekrar deneyin.'
        break
      case 'auth/invalid-email':
        errorMessage = 'Geçersiz e-posta adresi. Lütfen doğru formatta bir e-posta girin.'
        break
      case 'auth/user-disabled':
        errorMessage = 'Bu hesap devre dışı bırakılmış. Lütfen destek ile iletişime geçin.'
        break
      case 'auth/too-many-requests':
        errorMessage = 'Çok fazla başarısız giriş denemesi. Lütfen bir süre sonra tekrar deneyin.'
        break
      case 'auth/network-request-failed':
        errorMessage = 'Ağ hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.'
        break
      default:
        // Bilinmeyen hatalar için orijinal mesajı kullan
        errorMessage = error.message
    }
    
    return { success: false, error: errorMessage, code: errorCode }
  }
}

export const loginWithGoogleAuth = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    const user = result.user
    
    // Eğer displayName yoksa, email'den otomatik oluştur (@gmail.com'dan önceki kısım)
    if (!user.displayName && user.email) {
      const emailLocalPart = user.email.split('@')[0]
      if (emailLocalPart && emailLocalPart.length >= 2) {
        // İlk harfi büyük, geri kalanını küçük yap
        const displayName = emailLocalPart.charAt(0).toUpperCase() + emailLocalPart.slice(1).toLowerCase()
        try {
          await updateProfile(user, { displayName })
          // Kullanıcı bilgilerini yenile
          await user.reload()
        } catch (updateError) {
          console.warn('⚠️ Display name güncellenemedi:', updateError)
          // Hata olsa bile login başarılı sayılır
        }
      }
    }
    
    return { success: true, user: auth.currentUser || user }
  } catch (error) {
    // Hata kodlarına göre kullanıcı dostu Türkçe mesajlar
    let errorMessage = error.message
    const errorCode = error.code
    
    switch (errorCode) {
      case 'auth/popup-closed-by-user':
        // Popup kullanıcı tarafından kapatıldıysa sessizce dön (normal davranış)
        return { success: false, error: '', code: errorCode, cancelled: true }
      case 'auth/popup-blocked':
        errorMessage = 'Popup penceresi engellenmiş. Lütfen popup engelleyicisini kapatıp tekrar deneyin.'
        break
      case 'auth/cancelled-popup-request':
        errorMessage = 'Popup isteği iptal edildi. Lütfen tekrar deneyin.'
        break
      case 'auth/account-exists-with-different-credential':
        errorMessage = 'Bu e-posta adresi farklı bir giriş yöntemi ile kayıtlı. Lütfen e-posta/şifre ile giriş yapmayı deneyin.'
        break
      case 'auth/network-request-failed':
        errorMessage = 'Ağ hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.'
        break
      default:
        // Bilinmeyen hatalar için orijinal mesajı kullan
        errorMessage = error.message
    }
    
    return { success: false, error: errorMessage, code: errorCode }
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
    // Hata kodlarına göre kullanıcı dostu Türkçe mesajlar
    let errorMessage = error.message
    const errorCode = error.code
    
    switch (errorCode) {
      case 'auth/email-already-in-use':
        errorMessage = 'Bu e-posta adresi zaten kullanılıyor. Lütfen giriş yapmayı deneyin veya farklı bir e-posta kullanın.'
        break
      case 'auth/invalid-email':
        errorMessage = 'Geçersiz e-posta adresi. Lütfen doğru formatta bir e-posta girin.'
        break
      case 'auth/weak-password':
        errorMessage = 'Şifre çok zayıf. Şifre en az 6 karakter olmalıdır.'
        break
      case 'auth/operation-not-allowed':
        errorMessage = 'Bu işlem şu anda devre dışı. Lütfen daha sonra tekrar deneyin.'
        break
      case 'auth/network-request-failed':
        errorMessage = 'Ağ hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.'
        break
      default:
        // Bilinmeyen hatalar için orijinal mesajı kullan
        errorMessage = error.message
    }
    
    return { success: false, error: errorMessage, code: errorCode }
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


