import React from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../contexts/LanguageContext'

function NotFound() {
  const { t } = useLanguage()

  const starField = [
    { id: 's1', top: '8%', left: '12%', size: '15px', opacity: 0.45, duration: '6s', delay: '0s', spinDuration: '10s' },
    { id: 's2', top: '14%', left: '28%', size: '12px', opacity: 0.3, duration: '7.5s', delay: '1.2s', spinDuration: '12s' },
    { id: 's3', top: '6%', left: '52%', size: '11px', opacity: 0.35, duration: '5.5s', delay: '0.8s', spinDuration: '9s' },
    { id: 's4', top: '18%', left: '70%', size: '16px', opacity: 0.4, duration: '6.6s', delay: '2.4s', spinDuration: '11s' },
    { id: 's5', top: '28%', left: '40%', size: '13px', opacity: 0.28, duration: '8s', delay: '1.6s', spinDuration: '14s' },
    { id: 's6', top: '36%', left: '18%', size: '10px', opacity: 0.24, duration: '9s', delay: '0.4s', spinDuration: '8s' },
    { id: 's7', top: '42%', left: '64%', size: '13px', opacity: 0.35, duration: '7s', delay: '2.1s', spinDuration: '10s' },
    { id: 's8', top: '52%', left: '82%', size: '12px', opacity: 0.3, duration: '5.8s', delay: '1.7s', spinDuration: '13s' },
    { id: 's9', top: '58%', left: '28%', size: '14px', opacity: 0.32, duration: '6.4s', delay: '2.6s', spinDuration: '9.5s' },
    { id: 's10', top: '64%', left: '52%', size: '15px', opacity: 0.38, duration: '7.8s', delay: '0.9s', spinDuration: '11.5s' },
    { id: 's11', top: '72%', left: '12%', size: '11px', opacity: 0.26, duration: '8.2s', delay: '1.3s', spinDuration: '12.5s' },
    { id: 's12', top: '78%', left: '36%', size: '13px', opacity: 0.3, duration: '6.7s', delay: '2.8s', spinDuration: '10s' },
    { id: 's13', top: '84%', left: '58%', size: '12px', opacity: 0.28, duration: '7.3s', delay: '1.8s', spinDuration: '9s' },
    { id: 's14', top: '72%', left: '72%', size: '14px', opacity: 0.34, duration: '6.1s', delay: '0.7s', spinDuration: '13.5s' },
    { id: 's15', top: '50%', left: '10%', size: '10px', opacity: 0.22, duration: '8.6s', delay: '2.2s', spinDuration: '11s' }
  ]

  const planetGlows = [
    { id: 'p1', top: '-18%', left: '-12%', size: '420px', opacity: 0.45, blur: '160px', duration: '32s', delay: '0s' },
    { id: 'p2', top: '68%', left: '60%', size: '360px', opacity: 0.35, blur: '140px', duration: '38s', delay: '6s' },
    { id: 'p3', top: '18%', left: '72%', size: '280px', opacity: 0.28, blur: '120px', duration: '44s', delay: '3s' }
  ]

  const planetDecorations = [
    {
      id: 'planet-alpha',
      top: '18%',
      left: '12%',
      size: '140px',
      shimmerDuration: '7s',
      orbitDuration: '26s',
      colors: {
        highlight: 'rgba(255, 245, 255, 0.85)',
        core: 'rgba(92, 111, 255, 0.65)',
        shadow: 'rgba(24, 31, 64, 0.95)',
        lightRing: 'rgba(166, 218, 255, 0.55)'
      },
      shadow: '0 0 45px rgba(99, 102, 241, 0.45)'
    },
    {
      id: 'planet-beta',
      top: '62%',
      left: '70%',
      size: '180px',
      shimmerDuration: '9s',
      orbitDuration: '32s',
      colors: {
        highlight: 'rgba(255, 244, 214, 0.85)',
        core: 'rgba(255, 182, 103, 0.6)',
        shadow: 'rgba(58, 27, 15, 0.9)',
        lightRing: 'rgba(255, 223, 186, 0.45)'
      },
      shadow: '0 0 55px rgba(255, 176, 92, 0.35)'
    },
    {
      id: 'planet-gamma',
      top: '8%',
      left: '74%',
      size: '110px',
      shimmerDuration: '6.5s',
      orbitDuration: '22s',
      colors: {
        highlight: 'rgba(225, 255, 242, 0.85)',
        core: 'rgba(84, 222, 188, 0.55)',
        shadow: 'rgba(9, 47, 44, 0.92)',
        lightRing: 'rgba(178, 255, 229, 0.45)'
      },
      shadow: '0 0 38px rgba(84, 222, 188, 0.4)'
    }
  ]

  const statusChips = [
    t('notFoundStatus1'),
    t('notFoundStatus2'),
    t('notFoundStatus3')
  ]

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-indigo-950 px-3 sm:px-6 py-12 sm:py-16 text-center text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_55%)]" />

        {planetGlows.map(glow => (
          <div
            key={glow.id}
            className="absolute rounded-full bg-gradient-to-br from-indigo-500/30 via-purple-500/20 to-transparent animate-slow-drift"
            style={{
              top: glow.top,
              left: glow.left,
              width: glow.size,
              height: glow.size,
              opacity: glow.opacity,
              filter: `blur(${glow.blur})`,
              animationDelay: glow.delay,
              '--drift-duration': glow.duration
            }}
          />
        ))}

        {planetDecorations.map(planet => (
          <div
            key={planet.id}
            className="absolute"
            style={{
              top: planet.top,
              left: planet.left,
              width: planet.size,
              height: planet.size
            }}
          >
            <div className="absolute inset-0 animate-planet-shimmer" style={{ '--shimmer-duration': planet.shimmerDuration }}>
              <div
                className="absolute inset-0 rounded-full opacity-90"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${planet.colors.highlight}, ${planet.colors.core} 45%, ${planet.colors.shadow} 85%)`,
                  boxShadow: planet.shadow
                }}
              />
              <div
                className="absolute inset-0 rounded-full mix-blend-screen opacity-50"
                style={{
                  background: `radial-gradient(circle at 65% 35%, ${planet.colors.lightRing}, transparent 60%)`
                }}
              />
            </div>
            <div
              className="absolute inset-0 animate-orbit"
              style={{ '--orbit-duration': planet.orbitDuration }}
            >
              <span
                className="absolute inset-0 rounded-full border border-indigo-200/20"
                style={{
                  transform: 'scale(1.25)',
                  opacity: 0.4,
                  filter: 'blur(0.5px)'
                }}
              />
              <span
                className="absolute inset-0 rounded-full border border-indigo-200/10"
                style={{
                  transform: 'scale(1.45)',
                  opacity: 0.25,
                  filter: 'blur(2px)'
                }}
              />
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  transform: 'translateX(140%)',
                  width: '12%',
                  height: '12%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0))',
                  borderRadius: '9999px',
                  filter: 'blur(1px)'
                }}
              />
            </div>
          </div>
        ))}

        {starField.map(star => (
          <span
            key={star.id}
            className="absolute star-shape bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.35)] animate-twinkle animate-star-spin"
            style={{
              top: star.top,
              left: star.left,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDelay: star.delay,
              '--twinkle-duration': star.duration,
              '--star-spin-duration': star.spinDuration
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center gap-8 sm:gap-10 px-3 sm:px-4">
        <div className="flex flex-col items-center gap-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-3 sm:px-4 py-1 text-[0.62rem] sm:text-[0.7rem] font-semibold uppercase tracking-[0.22em] sm:tracking-[0.35em] text-indigo-200">
            {t('notFoundBadge')}
          </span>
          <div className="text-[3.25rem] sm:text-[5.5rem] md:text-[7.5rem] lg:text-[8rem] font-black tracking-[0.12em] sm:tracking-[0.22em] md:tracking-[0.28em] text-transparent bg-clip-text bg-gradient-to-br from-indigo-200 via-purple-200 to-white drop-shadow-[0_0_45px_rgba(99,102,241,0.35)]">
            404
          </div>
          <h1 className="text-lg sm:text-3xl font-semibold text-indigo-100">
            {t('notFoundTitle')}
          </h1>
          <p className="max-w-xl px-1 text-sm sm:px-0 sm:text-base text-indigo-100/80 leading-relaxed">
            {t('notFoundDescription')}
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 text-[0.6rem] sm:text-[0.7rem] text-indigo-100/70">
          {statusChips.map((chip, index) => (
            <span
              key={index}
              className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 sm:px-4 py-1.5 sm:py-2 backdrop-blur-sm"
            >
              {chip}
            </span>
          ))}
        </div>

        <Link
          to="/"
          className="group relative inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-5 sm:px-7 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white shadow-[0_12px_35px_rgba(79,70,229,0.35)] transition-transform duration-300 hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/50"
        >
          <span className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/20 text-base sm:text-xl transition-transform duration-300 group-hover:translate-x-1">
            🚀
          </span>
          {t('notFoundBackHome')}
        </Link>

        <p className="text-[0.62rem] sm:text-xs text-indigo-100/60">
          {t('notFoundSupport')} <span className="text-indigo-200">{t('notFoundSupportTeam')}</span> {t('notFoundSupportContact')}
        </p>
      </div>
    </div>
  )
}

export default NotFound

