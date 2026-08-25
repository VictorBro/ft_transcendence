'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { logOut } from '@/lib/auth-client';
import { useRouter } from '@/i18n/navigation';

export function LogOutButton() {
  const router = useRouter();
  const t = useTranslations('LogOutButton');
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await logOut();
      // Home rather than the current page, which may well have needed the
      // session that just ended.
      router.replace('/');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={pending}
      className="underline underline-offset-4 disabled:opacity-60"
    >
      {pending ? t('signingOut') : t('signOut')}
    </button>
  );
}
