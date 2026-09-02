'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { UpdateProfileSchema, type SessionUser } from '@ft/shared';

import { updateProfile } from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';

export function ProfileForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const t = useTranslations('ProfileForm');
  const errorMessage = useErrorMessage();
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
        // An empty box means "remove it", which is null rather than an empty string.
        avatarUrl: avatarUrl === '' ? null : avatarUrl,
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
      setSaved(true);
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

      <Field
        label={t('avatarUrl')}
        name="avatarUrl"
        type="url"
        defaultValue={user.avatarUrl ?? ''}
        hint={t('avatarUrlHint')}
      />

      <FormError message={error} />
      {saved ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t('profileSaved')}
        </p>
      ) : null}
      <SubmitButton pending={pending}>{t('saveChanges')}</SubmitButton>
    </form>
  );
}
