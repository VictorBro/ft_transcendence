import type { Metadata } from 'next';

import { SignUpForm } from './signup-form';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
      <SignUpForm />
    </div>
  );
}
