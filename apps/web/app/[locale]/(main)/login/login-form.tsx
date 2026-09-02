'use client';

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { LoginSchema, SecondFactorSchema } from '@ft/shared';

import { logIn, verifySecondFactor } from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';

export function LoginForm() {
  const router = useRouter();
  const t = useTranslations('LoginForm');
  // Zod issues and API failures both arrive as codes; this turns either into a
  // sentence in the language of the page.
  const errorMessage = useErrorMessage();
  const [secondFactor, setSecondFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Landing on the profile proves the cookie survived the round trip. */
  function done() {
    router.replace('/');
    router.refresh();
  }

  async function submitPassword(form: FormData) {
    // The same schema the API applies, so the obvious mistakes never leave the page.
    const parsed = LoginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setError(errorMessage(parsed.error.issues[0].message));
      return;
    }

    const result = await logIn(parsed.data);
    if (result.ok === 'twoFactor') {
      setSecondFactor(true);
      setError(null);
      return;
    }
    if (!result.ok) {
      setError(errorMessage(result.code, result.status));
      return;
    }
    done();
  }

  async function submitCode(form: FormData) {
    const parsed = SecondFactorSchema.safeParse({ code: form.get('code') });
    if (!parsed.success) {
      setError(errorMessage(parsed.error.issues[0].message));
      return;
    }

    const result = await verifySecondFactor(parsed.data.code);
    if (!result.ok) {
      setError(errorMessage(result.code, result.status));
      return;
    }
    done();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await (secondFactor ? submitCode(form) : submitPassword(form));
    } finally {
      setPending(false);
    }
  }

  if (secondFactor) {
    return (
      // Distinct key from the password form. Both render a <form> holding
      // <Field>, so without it React reuses the password input's DOM node for
      // the code input and the typed password reappears, in clear text.
      <form key="second-factor" onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('twoFactorPrompt')}</p>
        <Field
          label={t('authenticationCode')}
          name="code"
          autoComplete="one-time-code"
          inputMode="text"
          autoFocus
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>{t('verify')}</SubmitButton>
      </form>
    );
  }

  return (
    <form key="password" onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Field label={t('email')} name="email" type="email" autoComplete="email" required />
      <Field
        label={t('password')}
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>{t('signIn')}</SubmitButton>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('noAccountYet')}{' '}
        <Link href="/signup" className="underline underline-offset-4">
          {t('createOne')}
        </Link>
        .
      </p>
    </form>
  );
}
