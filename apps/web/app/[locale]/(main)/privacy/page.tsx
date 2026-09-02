import type { Metadata } from 'next';
import type { Locale } from '@ft/shared';

import { LegalArticle } from '@/components/legal-article';
import { getLegalContent } from '@/lib/legal-content';

type Props = { params: Promise<{ locale: Locale }> };

// generateMetadata, not a static `metadata` export: the title and description
// are part of the translated document, so they cannot be known before the
// locale segment is resolved.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const { privacyPolicy } = getLegalContent(locale);

  return { title: privacyPolicy.title, description: privacyPolicy.description };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;

  return <LegalArticle doc={getLegalContent(locale).privacyPolicy} />;
}
