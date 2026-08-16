'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { SUPPORTED_LOCALES, UpdateProfileSchema, type SessionUser } from '@ft/shared';

import { updateProfile, uploadAvatar } from '@/lib/auth-client';
import { Field, FormError, SubmitButton } from '@/components/form';
import { Avatar } from '@/components/avatar';

const LOCALE_LABELS: Record<string, string> = { en: 'English', fr: 'Français', de: 'Deutsch' };
const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MiB

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);

  async function onRemoveAvatar() {
    setRemoveAvatar(true);
    setAvatarPending(true);
    setAvatarError(null);
    try {
      const result = await updateProfile({ avatarUrl: null });
      if (!result.ok) {
        setAvatarError(result.message);
        return;
      }
      router.refresh();
    } finally {
      setRemoveAvatar(false);
      setAvatarPending(false);
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = '';

    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('File is too large. Maximum size is 2 MiB.');
      return;
    }

    setAvatarPending(true);
    setAvatarError(null);
    try {
      const result = await uploadAvatar(file);
      if (!result.ok) {
        setAvatarError(result.message);
        return;
      }
      router.refresh();
    } finally {
      setAvatarPending(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setSaved(false);
    const form = new FormData(event.currentTarget);

    try {
      const parsed = UpdateProfileSchema.safeParse({
        displayName: String(form.get('displayName') ?? ''),
        locale: form.get('locale'),
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

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Avatar</span>
        <div className="flex items-center gap-4">
          <Avatar src={user.avatarUrl} alt="" size={64} />
          <label className="cursor-pointer text-sm underline underline-offset-4">
            {avatarPending ? 'Uploading...' : user.avatarUrl ? 'Change avatar' : 'Upload avatar'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onAvatarChange}
              className="sr-only"
              disabled={avatarPending}
            />
          </label>
          {user.avatarUrl !== null ? (
            <button
              type="button"
              onClick={onRemoveAvatar}
              className="text-sm underline underline-offset-4"
              disabled={avatarPending || removeAvatar}
            >
              {removeAvatar ? 'Removing...' : 'Remove avatar'}
            </button>
          ) : null}
        </div>
        {avatarError ? <FormError message={avatarError} /> : null}
      </div>

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
