import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <LoginForm />
    </div>
  );
}
