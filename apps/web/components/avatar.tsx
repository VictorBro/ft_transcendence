import Image from 'next/image';

import { avatarHue, avatarInitial } from '@/lib/avatar';

/**
 * Decorative: every use sits next to the display name, so it is hidden from
 * screen readers rather than repeating it.
 */
export function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  if (src !== null) {
    return (
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        // The file is served by the api, which Next's optimiser cannot reach:
        // it would fetch the path from the web container instead.
        unoptimized
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  // Drawn rather than a stored image: nothing to ship and nothing to 404.
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className="rounded-full">
      <circle cx="20" cy="20" r="20" fill={`hsl(${avatarHue(name)} 45% 32%)`} />
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize="18" fill="#fff">
        {avatarInitial(name)}
      </text>
    </svg>
  );
}
