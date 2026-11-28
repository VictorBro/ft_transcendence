'use client';

import { useState } from 'react';
import { Link, useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { SignUpFormSchema } from '@ft/shared';

import { signUp } from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, PasswordField, SubmitButton } from '@/components/form';

export function SignUpForm() {
  const router = useRouter();
  const t = useTranslations('SignUpForm');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);

    try {
      // Identical rules to the API's, from the same schema, which is what the
      // subject means by validating on both sides. The confirmation is the one
      // rule the server does not share, so it is stripped before sending.
      const parsed = SignUpFormSchema.safeParse({
        email: form.get('email'),
        displayName: form.get('displayName'),
        password: form.get('password'),
        confirmPassword: form.get('confirmPassword'),
      });
      if (!parsed.success) {
        setError(errorMessage(parsed.error.issues[0].message));
        return;
      }

      const { confirmPassword: _confirmPassword, ...credentials } = parsed.data;
      const result = await signUp(credentials);
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }

      // A new account has no course yet, so /learn would only redirect here.
      router.replace('/onboarding');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    // method="post": an Enter pressed before hydration, or without JavaScript,
    // would otherwise send a GET with the password in the URL, where the
    // browser history and Caddy's access log keep it.
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Field label={t('email')} name="email" type="email" autoComplete="email" required />
      <Field
        label={t('displayName')}
        name="displayName"
        autoComplete="nickname"
        hint={t('displayNameHint')}
        required
      />
      <PasswordField
        label={t('password')}
        name="password"
        autoComplete="new-password"
        hint={t('passwordHint')}
        required
      />
      <PasswordField
        label={t('confirmPassword')}
        name="confirmPassword"
        autoComplete="new-password"
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>{t('createAccount')}</SubmitButton>
      <p className="text-sm text-slate-300">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="underline underline-offset-4">
          {t('signIn')}
        </Link>
        .
      </p>
    </form>
  );
}
