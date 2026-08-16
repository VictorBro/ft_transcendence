'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SUPPORTED_LOCALES, UpdateProfileSchema, type SessionUser } from '@ft/shared';

import { updateProfile } from '@/lib/auth-client';
import { Field, FormError, SubmitButton } from '@/components/form';

const LOCALE_LABELS: Record<string, string> = { en: 'English', fr: 'Français', de: 'Deutsch' };

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    const form = new FormData(event.currentTarget);

    try {
      const avatarUrl = String(form.get('avatarUrl') ?? '').trim();
      const parsed = UpdateProfileSchema.safeParse({
        displayName: String(form.get('displayName') ?? ''),
        locale: form.get('locale'),
        // An empty box means "remove it", which is null rather than an empty string.
        avatarUrl: avatarUrl === '' ? null : avatarUrl,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }

      const result = await updateProfile(parsed.data);
      if (!result.ok) {
        setError(result.message);
        return;
      }

      setError(null);
      setSaved(true);
      // The header greets the user by name, so it has to re-render too.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-6" noValidate>
      <h2 className="text-lg font-medium">Edit profile</h2>
      <Field label="Display name" name="displayName" defaultValue={user.displayName} required />

      <div className="flex flex-col gap-2">
        <label htmlFor="locale" className="text-sm font-medium">
          Language
        </label>
        <select
          id="locale"
          name="locale"
          defaultValue={user.locale}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_LABELS[locale] ?? locale}
            </option>
          ))}
        </select>
      </div>

      <Field
        label="Avatar URL"
        name="avatarUrl"
        type="url"
        defaultValue={user.avatarUrl ?? ''}
        hint="Leave empty to use the default avatar."
      />

      <FormError message={error} />
      {saved ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          Profile saved.
        </p>
      ) : null}
      <SubmitButton pending={pending}>Save changes</SubmitButton>
    </form>
  );
}
