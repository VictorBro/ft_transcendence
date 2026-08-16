import Image from 'next/image';

const DEFAULT_AVATAR = '/avatars/default.png';

export function Avatar({ src, alt, size = 32 }: { src: string | null; alt: string; size: number }) {
  return (
    <Image
      src={src ?? DEFAULT_AVATAR}
      alt={alt}
      width={size}
      height={size}
      unoptimized={src !== null}
      className="rounded-full object-cover"
    />
  );
}
