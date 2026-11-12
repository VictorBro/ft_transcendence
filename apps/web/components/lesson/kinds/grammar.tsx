'use client';

import { useLocale, useTranslations } from 'next-intl';

import { pick } from '@/lib/localized';
import { MatchingBoard } from '../board';
import { RichText } from '../rich-text';
import type { ItemProps, ItemRenderers } from '../types';
import { Hint, ItemCard, Units } from '../units';

/**
 * The grammar kind's renderers (#146): the explanation, the two boards,
 * and the exercises built from the B1 controls. The host finds them by
 * item type in the registry.
 */

function Explanation({ item, lang }: ItemProps<'grammar_explanation'>) {
  const t = useTranslations('Lesson');
  const locale = useLocale();
  return (
    <ItemCard>
      <h2 className="text-xl font-semibold">{pick(item.heading, locale)}</h2>
      <RichText source={pick(item.text, locale)} lang={lang} />
      {item.formTable.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-700 text-base text-slate-400">
                <th scope="col" className="w-1/4 py-3 pr-4 font-semibold">
                  {t('subject')}
                </th>
                <th scope="col" className="w-1/5 py-3 pr-4 font-semibold">
                  {t('form')}
                </th>
                <th scope="col" className="py-3 font-semibold">
                  {t('example')}
                </th>
              </tr>
            </thead>
            <tbody>
              {item.formTable.map((row, n) => (
                <tr key={n} className="border-b border-slate-800 last:border-0">
                  <td className="py-2 pr-4 text-slate-400">{row.subject}</td>
                  <td lang={lang} className="py-2 pr-4 font-semibold text-indigo-200">
                    {row.form}
                  </td>
                  <td lang={lang} className="py-2 text-slate-300">
                    {row.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {item.examples.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-slate-200">{t('examples')}</h3>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {item.examples.map((example, n) => (
              <li key={n}>
                <span lang={lang} className="font-semibold text-slate-100">
                  {example.text}
                </span>
                <span className="text-slate-400"> – {example.translation}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ItemCard>
  );
}

function PersonMatching({ item, ...props }: ItemProps<'grammar_person_matching'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="pairs" persons {...props} />
    </ItemCard>
  );
}

function PronounFormMatch({ item, ...props }: ItemProps<'grammar_pronoun_form_match'>) {
  return (
    <ItemCard>
      <MatchingBoard units={item.units} layout="drag" {...props} />
    </ItemCard>
  );
}

function PronounFormTyping({ item, ...props }: ItemProps<'grammar_pronoun_form_typing'>) {
  // One row per pronoun, the pronoun beside its field, as in the mockup.
  return (
    <ItemCard>
      <div className="lesson-form-rows">
        <Units units={item.units} {...props} />
      </div>
    </ItemCard>
  );
}

function GapChoice({ item, ...props }: ItemProps<'grammar_gap_choice'>) {
  return (
    <ItemCard>
      <Hint hint={item.hint} />
      <Units units={item.units} {...props} />
    </ItemCard>
  );
}

function GapTyping({ item, ...props }: ItemProps<'grammar_gap_typing'>) {
  return (
    <ItemCard>
      <Hint hint={item.hint} />
      <Units units={item.units} {...props} />
    </ItemCard>
  );
}

function WordOrder({ item, ...props }: ItemProps<'grammar_word_order'>) {
  return (
    <ItemCard>
      <Units units={item.units} {...props} />
    </ItemCard>
  );
}

function ErrorSpotter({ item, ...props }: ItemProps<'grammar_error_spotter'>) {
  return (
    <ItemCard>
      <Units units={item.units} {...props} />
    </ItemCard>
  );
}

export const grammarRenderers: ItemRenderers = {
  grammar_explanation: Explanation,
  grammar_person_matching: PersonMatching,
  grammar_pronoun_form_match: PronounFormMatch,
  grammar_pronoun_form_typing: PronounFormTyping,
  grammar_gap_choice: GapChoice,
  grammar_gap_typing: GapTyping,
  grammar_word_order: WordOrder,
  grammar_error_spotter: ErrorSpotter,
};
