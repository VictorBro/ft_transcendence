import type { Metadata } from 'next';

import { LegalArticle } from '@/components/legal-article';
import { termsOfService } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: termsOfService.title,
  description: termsOfService.description,
};

export default function TermsPage() {
  return <LegalArticle doc={termsOfService} />;
}
