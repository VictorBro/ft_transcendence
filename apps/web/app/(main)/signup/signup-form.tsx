'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SignUpFormSchema } from '@ft/shared';

import { signUp } from '@/lib/auth-client';
import { Field, FormError, SubmitButton } from '@/components/form';

export function SignUpForm() {
  const router = useRouter();
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
        setError(parsed.error.issues[0].message);
        return;
      }

      const { confirmPassword: _confirmPassword, ...credentials } = parsed.data;
      const result = await signUp(credentials);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      router.replace('/profile');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        hint="Letters, digits, dot, underscore and hyphen. At least 3 characters."
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters, with an uppercase letter, a lowercase letter and a digit."
        required
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Already have an account?{' '}
        <Link href="/login" className="underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </form>
  );
}
