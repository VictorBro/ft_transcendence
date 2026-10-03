'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { useTranslations } from 'next-intl';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

/**
 * The label is tied to the input by a generated id rather than by wrapping,
 * because screen readers announce the association and the accessibility module
 * depends on every control having one.
 */
export function Field({ label, hint, ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100"
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** role="alert" so a failed submit is announced, not just repainted. */
export function FormError({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-red-400">
      {message}
    </p>
  );
}

/**
 * For the links and plain buttons that stand in for one of the two below. 44px
 * tall at least, a thumb's width, and the ring offset so it reads around a
 * light fill too.
 */
const BUTTON =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-100 disabled:cursor-not-allowed disabled:opacity-60';
export const PRIMARY_BUTTON = `${BUTTON} border-transparent bg-slate-100 text-slate-900 hover:bg-white disabled:bg-slate-100`;
export const SECONDARY_BUTTON = `${BUTTON} border-slate-700 text-slate-200 hover:bg-slate-800 disabled:bg-transparent`;

export function SubmitButton({
  pending,
  disabled = false,
  children,
}: {
  pending: boolean;
  /** An incomplete form is unclickable without the button reading "working". */
  disabled?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('Form');

  return (
    <button type="submit" disabled={pending || disabled} className={PRIMARY_BUTTON}>
      {pending ? t('working') : children}
    </button>
  );
}
