import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';
import { SECONDARY_BUTTON } from './form';

/**
 * To the conversation with a friend, from their row or their profile. Labelled
 * without the name, so it never passes for the profile link beside it. No
 * prefetch, like that link: a list of people would cost a render each against
 * the rate limit.
 */
export function MessageLink({ userId }: { userId: string }) {
  const t = useTranslations('FriendsPage');

  return (
    <Link href={`/chat?with=${userId}`} prefetch={false} className={SECONDARY_BUTTON}>
      {t('message')}
    </Link>
  );
}
