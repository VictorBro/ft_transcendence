import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { currentUser } from '@/lib/session';

// The call to action reads from the session, so this page is never prerendered:
// a build-time snapshot would send a signed-in visitor to /signup.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await currentUser();
  const t = await getTranslations('HomePage');

  return (
    <div className="flex flex-col gap-12">
      <section className="flex items-center justify-between gap-12">
        <div className="flex flex-col gap-4">
          <h1 className="mt-16 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {t('headline')}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">{t('intro')}</p>
          <Link
            href={user ? '/dashboard' : '/signup'}
            className="mt-4 flex w-fit items-center rounded-full bg-indigo-700 px-20 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700 active:bg-indigo-900"
          >
            {user ? t('goToLobby') : t('startNow')}
          </Link>
        </div>
        <Image
          src="/logo.png"
          alt={t('logoAlt')}
          width={600}
          height={600}
          className="h-auto w-64 shrink-0 sm:w-[28rem]"
          // Without this next/image assumes full viewport width and picks the
          // largest srcset candidate for a 256px slot.
          sizes="(min-width: 640px) 28rem, 16rem"
          priority
        />
      </section>
    </div>
  );
}
