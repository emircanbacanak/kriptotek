// ============================================
// MongoDB Verilerini Kontrol Et (Tarayıcı Konsolu)
// ============================================
// Bu script'i tarayıcı konsoluna (F12) yapıştır ve çalıştır
// ============================================

(async function checkMongoDBData() {
  // Backend API URL'i
  const API_URL = 'http://localhost:3000'
  
  console.log('🔍 MongoDB Verilerini Kontrol Ediyorum...\n')
  console.log('📡 Backend API URL:', API_URL)
  console.log('─'.repeat(60))
  
  // Önce backend'in çalışıp çalışmadığını kontrol et
  try {
    const healthCheck = await fetch(`${API_URL}/health`)
    if (!healthCheck.ok) {
      console.error('❌ Backend API yanıt vermiyor:', healthCheck.status)
      console.error('   → Backend\'in çalıştığından emin olun: npm run dev:all')
      return
    }
    const health = await healthCheck.json()
    console.log('✅ Backend API çalışıyor:', health)
    console.log('─'.repeat(60))
  } catch (error) {
    console.error('❌ Backend API\'ye bağlanılamıyor:', error.message)
    console.error('   → Backend\'in çalıştığından emin olun: npm run dev:all')
    return
  }
  
  // 1. Dominance Data
  console.log('\n📊 ========== DOMINANCE DATA ==========')
  try {
    const dominanceResponse = await fetch(`${API_URL}/api/cache/dominance_data`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    
    if (dominanceResponse.ok) {
      const dominanceData = await dominanceResponse.json()
      console.log('✅ Dominance Data Bulundu:')
      console.log('   - Global:', dominanceData.data?.global ? '✅ Var' : '❌ Yok')
      console.log('   - Dominance Data:', dominanceData.data?.dominanceData?.length || 0, 'coin')
      console.log('   - Volume Data:', dominanceData.data?.volumeData?.length || 0, 'coin')
      console.log('   - Historical Data:', dominanceData.data?.historicalData?.length || 0, 'gün')
      console.log('   - Last Update:', dominanceData.lastUpdate ? new Date(dominanceData.lastUpdate).toLocaleString('tr-TR') : 'N/A')
      
      if (dominanceData.data?.historicalData?.length > 0) {
        console.log('\n   📅 Historical Data Örnekleri:')
        dominanceData.data.historicalData.slice(0, 5).forEach((h, i) => {
          console.log(`   ${i + 1}. ${h.date}: BTC=${h.coin1?.toFixed(2)}%, ETH=${h.coin2?.toFixed(2)}%, Others=${h.others?.toFixed(2)}%`)
        })
      }
      
      // Tam veriyi görmek için (isteğe bağlı)
      console.log('\n   📋 Tam Veri (JSON):')
      console.log(JSON.stringify(dominanceData, null, 2))
    } else if (dominanceResponse.status === 404) {
      console.log('❌ Dominance Data Bulunamadı (404)')
      console.log('   → Veri henüz MongoDB\'ye kaydedilmemiş')
      console.log('   → Sayfayı yenileyin veya birkaç saniye bekleyin')
    } else {
      const errorText = await dominanceResponse.text()
      console.log('❌ Hata:', dominanceResponse.status, dominanceResponse.statusText)
      console.log('   Response:', errorText.substring(0, 200))
    }
  } catch (error) {
    console.error('❌ Dominance Data Hatası:', error.message)
    console.error('   → CORS hatası olabilir, backend CORS ayarlarını kontrol edin')
  }
  
  // 2. Fear & Greed Data
  console.log('\n\n😱 ========== FEAR & GREED DATA ==========')
  try {
    const fearGreedResponse = await fetch(`${API_URL}/api/cache/fear_greed`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    
    if (fearGreedResponse.ok) {
      const fearGreedData = await fearGreedResponse.json()
      console.log('✅ Fear & Greed Data Bulundu:')
      console.log('   - Value:', fearGreedData.data?.value || 'N/A', '/ 100')
      console.log('   - Classification:', fearGreedData.data?.classification || 'N/A')
      console.log('   - Timestamp:', fearGreedData.data?.timestamp ? new Date(fearGreedData.data.timestamp).toLocaleString('tr-TR') : 'N/A')
      console.log('   - Last Update:', fearGreedData.lastUpdate ? new Date(fearGreedData.lastUpdate).toLocaleString('tr-TR') : 'N/A')
      
      // Tam veriyi görmek için (isteğe bağlı)
      console.log('\n   📋 Tam Veri (JSON):')
      console.log(JSON.stringify(fearGreedData, null, 2))
    } else if (fearGreedResponse.status === 404) {
      console.log('❌ Fear & Greed Data Bulunamadı (404)')
      console.log('   → Veri henüz MongoDB\'ye kaydedilmemiş')
      console.log('   → Sayfayı yenileyin veya birkaç saniye bekleyin')
    } else {
      const errorText = await fearGreedResponse.text()
      console.log('❌ Hata:', fearGreedResponse.status, fearGreedResponse.statusText)
      console.log('   Response:', errorText.substring(0, 200))
    }
  } catch (error) {
    console.error('❌ Fear & Greed Data Hatası:', error.message)
    console.error('   → CORS hatası olabilir, backend CORS ayarlarını kontrol edin')
  }
  
  console.log('\n\n✅ Kontrol Tamamlandı!')
  console.log('─'.repeat(60))
})();

