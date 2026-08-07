import type { Metadata } from 'next';

import { LegalArticle } from '@/components/legal-article';
import { privacyPolicy } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.description,
};

export default function PrivacyPage() {
  return <LegalArticle doc={privacyPolicy} />;
}
