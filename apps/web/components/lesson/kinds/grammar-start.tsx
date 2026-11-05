import { useLocale, useTranslations } from 'next-intl';

import { pickNative } from '@/lib/localized';
import type { StartField } from '../types';

/** The grammar field of the lesson page: the verbs the lesson introduces, as a table. */
export const NewVerbs: StartField = function NewVerbs({ outline, lang }) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  const verbs = outline.newVerbs ?? [];
  if (verbs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-widest text-slate-500 uppercase">
        {t('newVerbs')}
      </h3>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400">
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('verb')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('translation')}
            </th>
          </tr>
        </thead>
        <tbody>
          {verbs.map((verb) => (
            <tr key={verb.infinitive} className="border-b border-slate-800 last:border-0">
              <td lang={lang} className="py-2 pr-4 font-medium text-slate-100">
                {verb.infinitive}
              </td>
              <td className="py-2 text-slate-300">{pickNative(verb.translation, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
