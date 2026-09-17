'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MAX_AVATAR_BYTES, UpdateProfileSchema, type SessionUser } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';

import { removeAvatar, updateProfile, uploadAvatar } from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';
import { Avatar } from '@/components/avatar';

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const t = useTranslations('ProfileForm');
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  // One state, not a boolean each: the label has to say which action is running.
  const [avatarPending, setAvatarPending] = useState<'upload' | 'remove' | null>(null);

  async function onRemoveAvatar() {
    setAvatarPending('remove');
    setAvatarError(null);
    try {
      const result = await removeAvatar();
      if (!result.ok) {
        setAvatarError(errorMessage(result.code, result.status));
        return;
      }
      router.refresh();
    } finally {
      setAvatarPending(null);
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = '';

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError(t('avatarTooLarge', { size: MAX_AVATAR_BYTES / 1024 ** 2 }));
      return;
    }

    setAvatarPending('upload');
    setAvatarError(null);
    try {
      const result = await uploadAvatar(file);
      if (!result.ok) {
        setAvatarError(errorMessage(result.code, result.status));
        return;
      }
      router.refresh();
    } finally {
      setAvatarPending(null);
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

  // The avatar saves the moment it is picked, the name only on submit, so they
  // are kept apart: inside one form the button would look like it saved both.
  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <Avatar src={user.avatarUrl} name={user.displayName} size={64} />
          <label className="cursor-pointer text-sm underline underline-offset-4">
            {avatarPending === 'upload'
              ? t('uploading')
              : user.avatarUrl
                ? t('changeAvatar')
                : t('uploadAvatar')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onAvatarChange}
              className="sr-only"
              disabled={avatarPending !== null}
            />
          </label>
          {user.avatarUrl !== null ? (
            <button
              type="button"
              onClick={onRemoveAvatar}
              className="text-sm underline underline-offset-4"
              disabled={avatarPending !== null}
            >
              {avatarPending === 'remove' ? t('removing') : t('removeAvatar')}
            </button>
          ) : null}
        </div>
        {avatarError ? <FormError message={avatarError} /> : null}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <Field
          label={t('displayName')}
          name="displayName"
          defaultValue={user.displayName}
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>{t('saveChanges')}</SubmitButton>
      </form>
    </div>
  );
}
