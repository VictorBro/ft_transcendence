import type { Language } from '@ft/shared';

/**
 * Drawn rather than shipped as files. Decorative: always next to the language
 * name, so hidden from screen readers. The Union Jack drops the offset that
 * makes the real saltire asymmetric, invisible at this size.
 */
const FLAGS: Record<Language, React.ReactNode> = {
  fr: (
    <>
      <rect width="8" height="16" fill="#002654" />
      <rect x="8" width="8" height="16" fill="#fff" />
      <rect x="16" width="8" height="16" fill="#ce1126" />
    </>
  ),
  de: (
    <>
      <rect width="24" height="5.34" fill="#000" />
      <rect y="5.34" width="24" height="5.33" fill="#dd0000" />
      <rect y="10.67" width="24" height="5.33" fill="#ffce00" />
    </>
  ),
  en: (
    <>
      <rect width="24" height="16" fill="#012169" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#fff" strokeWidth="3.2" />
      <path d="M0 0 L24 16 M24 0 L0 16" stroke="#c8102e" strokeWidth="1.9" />
      <path d="M12 0 V16 M0 8 H24" stroke="#fff" strokeWidth="5.3" />
      <path d="M12 0 V16 M0 8 H24" stroke="#c8102e" strokeWidth="3.2" />
    </>
  ),
};

export function Flag({ lang, className }: { lang: Language; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 16"
      width="24"
      height="16"
      aria-hidden
      // A ring, not an SVG stroke: a stroke would thicken with the flag.
      className={`shrink-0 rounded-xs ring-1 ring-white/50 ${className ?? ''}`}
    >
      {FLAGS[lang]}
    </svg>
  );
}
