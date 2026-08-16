'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { LoginSchema, SecondFactorSchema } from '@ft/shared';

import { logIn, verifySecondFactor } from '@/lib/auth-client';
import { Field, FormError, SubmitButton } from '@/components/form';

export function LoginForm() {
  const router = useRouter();
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
      setError(parsed.error.issues[0].message);
      return;
    }

    const result = await logIn(parsed.data);
    if (result.ok === 'twoFactor') {
      setSecondFactor(true);
      setError(null);
      return;
    }
    if (!result.ok) {
      setError(result.message);
      return;
    }
    done();
  }

  async function submitCode(form: FormData) {
    const parsed = SecondFactorSchema.safeParse({ code: form.get('code') });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    const result = await verifySecondFactor(parsed.data.code);
    if (!result.ok) {
      setError(result.message);
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
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Enter the six digit code from your authenticator app, or one of your recovery codes.
        </p>
        <Field
          label="Authentication code"
          name="code"
          autoComplete="one-time-code"
          inputMode="text"
          autoFocus
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>Verify</SubmitButton>
      </form>
    );
  }

  return (
    <form key="password" onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        No account yet?{' '}
        <Link href="/signup" className="underline underline-offset-4">
          Create one
        </Link>
        .
      </p>
    </form>
  );
}
