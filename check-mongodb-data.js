// MongoDB verilerini kontrol etmek için tarayıcı konsolunda çalıştırılabilir script
// Tarayıcı konsoluna yapıştır ve çalıştır

async function checkMongoDBData() {
  // Backend API URL'i - eğer farklı bir portta çalışıyorsa burayı değiştir
  const API_URL = 'http://localhost:3000'
  
  // Önce backend'in çalışıp çalışmadığını kontrol et
  console.log('🔍 Backend API kontrolü yapılıyor...')
  try {
    const healthCheck = await fetch(`${API_URL}/health`)
    if (healthCheck.ok) {
      const health = await healthCheck.json()
      console.log('✅ Backend API çalışıyor:', health)
    } else {
      console.error('❌ Backend API yanıt vermiyor:', healthCheck.status)
      return
    }
  } catch (error) {
    console.error('❌ Backend API\'ye bağlanılamıyor:', error.message)
    console.error('   → Backend\'in çalıştığından emin olun: npm run dev:all')
    return
  }
  
  console.log('🔍 MongoDB Verilerini Kontrol Ediyorum...\n')
  
  // 1. Dominance Data
  console.log('📊 ========== DOMINANCE DATA ==========')
  try {
    const dominanceResponse = await fetch(`${API_URL}/api/cache/dominance_data`)
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
        dominanceData.data.historicalData.slice(0, 3).forEach((h, i) => {
          console.log(`   ${i + 1}. ${h.date}: BTC=${h.coin1?.toFixed(2)}%, ETH=${h.coin2?.toFixed(2)}%, Others=${h.others?.toFixed(2)}%`)
        })
      }
      
      console.log('\n   📋 Tam Veri:')
      console.log(JSON.stringify(dominanceData, null, 2))
    } else if (dominanceResponse.status === 404) {
      console.log('❌ Dominance Data Bulunamadı (404)')
      console.log('   → Veri henüz MongoDB\'ye kaydedilmemiş')
    } else {
      console.log('❌ Hata:', dominanceResponse.status, dominanceResponse.statusText)
    }
  } catch (error) {
    console.error('❌ Dominance Data Hatası:', error.message)
  }
  
  console.log('\n\n😱 ========== FEAR & GREED DATA ==========')
  try {
    const fearGreedResponse = await fetch(`${API_URL}/api/cache/fear_greed`)
    if (fearGreedResponse.ok) {
      const fearGreedData = await fearGreedResponse.json()
      console.log('✅ Fear & Greed Data Bulundu:')
      console.log('   - Value:', fearGreedData.data?.value || 'N/A')
      console.log('   - Classification:', fearGreedData.data?.classification || 'N/A')
      console.log('   - Timestamp:', fearGreedData.data?.timestamp ? new Date(fearGreedData.data.timestamp).toLocaleString('tr-TR') : 'N/A')
      console.log('   - Last Update:', fearGreedData.lastUpdate ? new Date(fearGreedData.lastUpdate).toLocaleString('tr-TR') : 'N/A')
      
      console.log('\n   📋 Tam Veri:')
      console.log(JSON.stringify(fearGreedData, null, 2))
    } else if (fearGreedResponse.status === 404) {
      console.log('❌ Fear & Greed Data Bulunamadı (404)')
      console.log('   → Veri henüz MongoDB\'ye kaydedilmemiş')
    } else {
      console.log('❌ Hata:', fearGreedResponse.status, fearGreedResponse.statusText)
    }
  } catch (error) {
    console.error('❌ Fear & Greed Data Hatası:', error.message)
  }
  
  console.log('\n\n✅ Kontrol Tamamlandı!')
}

// Fonksiyonu çalıştır
checkMongoDBData()

