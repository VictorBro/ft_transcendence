/**
 * Plays while the level is being saved, in the wordmark's palette. Decorative:
 * SubmitButton already announces the wait by switching to "working".
 */

/** The logo's sparkle: a four-pointed star with concave sides. */
const SPARKLE = 'M6 0C6 3.3 8.7 6 12 6 8.7 6 6 8.7 6 12 6 8.7 3.3 6 0 6 3.3 6 6 3.3 6 0Z';

export function Rocket({ className, bob = true }: { className?: string; bob?: boolean }) {
  return (
    <span className={`inline-flex items-end ${className ?? 'h-7 w-7'}`} aria-hidden>
      <svg viewBox="0 0 24 28" className="h-full w-full">
        <defs>
          <linearGradient id="rocket-hull" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="rocket-spark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
        </defs>

        {/* The idle bob is for the inline rocket. During a launch the whole
            element travels, and a second animation would fade it out mid-flight. */}
        <g className={bob ? 'animate-liftoff motion-reduce:animate-none' : undefined}>
          <path d="M7 12 3 17v3l4-3zM17 12l4 5v3l-4-3z" fill="url(#rocket-hull)" />
          <path d="M12 1c3.2 3.2 4.6 7 4.6 10.9V16H7.4v-4.1C7.4 8 8.8 4.2 12 1z" fill="#fff" />
          <circle cx="12" cy="9" r="2" fill="url(#rocket-hull)" />
          <path d="M9.4 16h5.2l-2.6 4z" fill="url(#rocket-spark)" />
        </g>

        {/* The exhaust, as the logo's sparkles. */}
        <g fill="url(#rocket-spark)">
          <path
            d={SPARKLE}
            transform="translate(6 19) scale(0.55)"
            className="animate-twinkle motion-reduce:animate-none"
          />
          <path
            d={SPARKLE}
            transform="translate(14 21) scale(0.4)"
            className="animate-twinkle motion-reduce:animate-none"
            style={{ animationDelay: '300ms' }}
          />
        </g>
      </svg>
    </span>
  );
}
