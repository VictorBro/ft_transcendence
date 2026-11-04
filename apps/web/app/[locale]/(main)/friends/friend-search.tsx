'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { UserSearchQuerySchema } from '@ft/shared';

import { useRouter } from '@/i18n/navigation';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';

/** The query goes in the URL: the page renders the results, so a live refresh updates them too. */
export function FriendSearch({ query }: { query: string }) {
  const t = useTranslations('FriendsPage');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    // An empty field clears the search rather than being too short.
    if (typeof q === 'string' && q.trim() === '') {
      setError(null);
      startTransition(() => router.replace('/friends'));
      return;
    }
    const parsed = UserSearchQuerySchema.safeParse({ q });
    if (!parsed.success) {
      setError(errorMessage(parsed.error.issues[0].message));
      return;
    }
    setError(null);
    startTransition(() => router.replace({ pathname: '/friends', query: { q: parsed.data.q } }));
  }

  return (
    <form role="search" onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label={t('searchLabel')}
        type="search"
        name="q"
        defaultValue={query}
        autoComplete="off"
      />
      <FormError message={error} />
      <SubmitButton pending={pending}>{t('search')}</SubmitButton>
    </form>
  );
}
