import React from 'react';

/** CyberSoap mascot: a cute cyber soap-bubble bot with a neon visor */
export default function Logo({ size = 32, animated = false, className = '' }) {
  return (
    <svg
      className={`logo ${animated ? 'logo-animated' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CyberSoap"
    >
      <defs>
        <linearGradient id="cs-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8be9fd" />
          <stop offset="0.5" stopColor="#bd93f9" />
          <stop offset="1" stopColor="#ff79c6" />
        </linearGradient>
        <radialGradient id="cs-fill" cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#44475a" />
          <stop offset="0.7" stopColor="#282a36" />
          <stop offset="1" stopColor="#191a21" />
        </radialGradient>
        <linearGradient id="cs-visor" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff79c6" />
          <stop offset="1" stopColor="#8be9fd" />
        </linearGradient>
        <filter id="cs-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* little bubbles */}
      <circle cx="104" cy="22" r="7" fill="none" stroke="#8be9fd" strokeWidth="2.5" opacity="0.85" className="bub b1" />
      <circle cx="116" cy="42" r="4" fill="none" stroke="#ff79c6" strokeWidth="2" opacity="0.8" className="bub b2" />
      <circle cx="18" cy="104" r="5" fill="none" stroke="#bd93f9" strokeWidth="2" opacity="0.8" className="bub b3" />
      {/* antenna */}
      <path d="M64 20 L64 8" stroke="#bd93f9" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="64" cy="7" r="4.5" fill="#50fa7b" filter="url(#cs-glow)" className="antenna" />
      {/* body bubble */}
      <circle cx="64" cy="66" r="46" fill="url(#cs-fill)" stroke="url(#cs-ring)" strokeWidth="5" filter="url(#cs-glow)" />
      {/* shine */}
      <path d="M36 50 A32 32 0 0 1 58 30" stroke="#f8f8f2" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.55" />
      <circle cx="33" cy="60" r="3" fill="#f8f8f2" opacity="0.5" />
      {/* visor */}
      <rect x="30" y="56" width="68" height="26" rx="13" fill="#191a21" stroke="url(#cs-visor)" strokeWidth="3" />
      <g filter="url(#cs-glow)" className="eyes">
        <rect x="44" y="63" width="12" height="12" rx="3" fill="#8be9fd" />
        <rect x="72" y="63" width="12" height="12" rx="3" fill="#ff79c6" />
      </g>
      {/* smile */}
      <path d="M54 92 Q64 100 74 92" stroke="#50fa7b" strokeWidth="3.5" strokeLinecap="round" fill="none" filter="url(#cs-glow)" />
      {/* circuit traces */}
      <path d="M99 74 L110 74 L116 80" stroke="#bd93f9" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="117" cy="81" r="2.6" fill="#bd93f9" />
      <path d="M29 74 L18 74 L12 68" stroke="#8be9fd" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="11" cy="67" r="2.6" fill="#8be9fd" />
    </svg>
  );
}
