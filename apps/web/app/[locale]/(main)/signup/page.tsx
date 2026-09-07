import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SignUpForm } from './signup-form';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('SignUpPage');

  return { title: t('heading') };
}

export default async function SignUpPage() {
  const t = await getTranslations('SignUpPage');

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('heading')}</h1>
      <SignUpForm />
    </div>
  );
}
