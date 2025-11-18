# Public Klasörü - Resim Dosyaları

Bu klasöre aşağıdaki resim dosyalarını yüklemelisiniz:

## Gerekli Resimler

### 1. Logo
- **Dosya adı:** `kriptotek.jpg`
- **Konum:** `public/kriptotek.jpg`
- **Kullanım:** Login, Register, ForgotPassword sayfalarında ve Header'da logo olarak kullanılıyor
- **Önerilen boyut:** 512x512px veya daha büyük (kare format)
- **Format:** JPG, PNG veya WebP

### 2. Borsa İkonları

#### MEXC İkonu
- **Dosya adı:** `mexc.png`
- **Konum:** `public/icons/mexc.png`
- **Kullanım:** Header ve Footer'da MEXC borsa linki için ikon
- **Önerilen boyut:** 64x64px veya 128x128px
- **Format:** PNG (şeffaf arka plan önerilir)

#### Bitget İkonu
- **Dosya adı:** `bitget.png`
- **Konum:** `public/icons/bitget.png`
- **Kullanım:** Header ve Footer'da Bitget borsa linki için ikon
- **Önerilen boyut:** 64x64px veya 128x128px
- **Format:** PNG (şeffaf arka plan önerilir)

## Klasör Yapısı

```
public/
├── kriptotek.jpg          (Logo)
└── icons/
    ├── mexc.png           (MEXC ikonu)
    └── bitget.png         (Bitget ikonu)
```

## Notlar

- Tüm resimler `public` klasörüne koyulmalı
- Vite'da `public` klasöründeki dosyalar root path'ten (`/`) erişilebilir
- Örnek: `public/kriptotek.jpg` → `/kriptotek.jpg` olarak erişilir
- Resimler optimize edilmiş olmalı (web için uygun boyut)

