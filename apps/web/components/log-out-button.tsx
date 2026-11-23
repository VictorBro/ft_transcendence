'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { logOut } from '@/lib/auth-client';
import { useRouter } from '@/i18n/navigation';
import { MENU_ROW, MenuIcon } from './menu-icon';
import { closeSocket } from './tab-socket';

export function LogOutButton() {
  const router = useRouter();
  const t = useTranslations('LogOutButton');
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await logOut();
      closeSocket();
      // Home rather than the current page, which may well have needed the
      // session that just ended.
      router.replace('/');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button type="button" onClick={() => void onClick()} disabled={pending} className={MENU_ROW}>
      <MenuIcon name="signOut" />
      {pending ? t('signingOut') : t('signOut')}
    </button>
  );
}
