import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LoginForm } from './login-form';

// generateMetadata rather than a static export: the browser tab is the one piece
// of a page that keeps rendering after the locale segment is resolved, so a
// literal here would label a French page in English.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('LoginPage');

  return { title: t('heading') };
}

export default async function LoginPage() {
  const t = await getTranslations('LoginPage');

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('heading')}</h1>
      <LoginForm />
    </div>
  );
}
