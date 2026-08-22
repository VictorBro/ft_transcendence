import type { Metadata } from 'next';
import Link from 'next/link';

import { requireUser } from '@/lib/session';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Profile' };

// Renders one specific person's data, so it must never be prerendered or cached.
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-10">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Joined {new Date(user.createdAt).toLocaleDateString('en-GB')}
        </p>
      </section>

      <ProfileForm user={user} />

      <section className="flex flex-col gap-3 border-t border-slate-200 pt-8 dark:border-slate-800">
        <h2 className="text-lg font-medium">Security</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Add a second factor so a stolen password is not enough to sign in.
        </p>
        <Link href="/settings/2fa" className="text-sm underline underline-offset-4">
          Two factor authentication
        </Link>
      </section>
    </div>
  );
}
