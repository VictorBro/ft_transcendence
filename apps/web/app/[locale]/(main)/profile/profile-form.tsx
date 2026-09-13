'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UpdateProfileSchema, type SessionUser } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';

import { updateProfile, uploadAvatar } from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';
import { Avatar } from '@/components/avatar';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MiB

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const t = useTranslations('ProfileForm');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
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
        setAvatarError(errorMessage(result.code, result.status));
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
      setAvatarError(t('avatarTooLarge'));
      return;
    }

    setAvatarPending(true);
    setAvatarError(null);
    try {
      const result = await uploadAvatar(file);
      if (!result.ok) {
        setAvatarError(errorMessage(result.code, result.status));
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
    const form = new FormData(event.currentTarget);

    try {
      const parsed = UpdateProfileSchema.safeParse({
        displayName: String(form.get('displayName') ?? ''),
      });
      if (!parsed.success) {
        setError(errorMessage(parsed.error.issues[0].message));
        return;
      }

      const result = await updateProfile(parsed.data);
      if (!result.ok) {
        setError(errorMessage(result.code, result.status));
        return;
      }

      setError(null);
      router.push('/profile');
      // The header greets the user by name, so it has to re-render too.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-6" noValidate>
      <h2 className="text-lg font-medium">{t('editProfile')}</h2>
      <Field label={t('displayName')} name="displayName" defaultValue={user.displayName} required />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('avatar')}</span>
        <div className="flex items-center gap-4">
          <Avatar src={user.avatarUrl} alt="" size={64} />
          <label className="cursor-pointer text-sm underline underline-offset-4">
            {avatarPending
              ? t('uploading')
              : user.avatarUrl
                ? t('changeAvatar')
                : t('uploadAvatar')}
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
              {removeAvatar ? t('removing') : t('removeAvatar')}
            </button>
          ) : null}
        </div>
        {avatarError ? <FormError message={avatarError} /> : null}
      </div>

      <FormError message={error} />
      <SubmitButton pending={pending}>{t('saveChanges')}</SubmitButton>
    </form>
  );
}
