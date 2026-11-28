'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { useTranslations } from 'next-intl';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

const INPUT =
  'rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-slate-100';

/**
 * The label is tied to the input by a generated id rather than by wrapping,
 * because screen readers announce the association and the accessibility module
 * depends on every control having one.
 */
function Labelled({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Field({ label, hint, ...input }: FieldProps) {
  const id = useId();

  return (
    <Labelled id={id} label={label} hint={hint}>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={INPUT}
        {...input}
      />
    </Labelled>
  );
}

type PasswordFieldProps = Omit<FieldProps, 'type' | 'autoComplete'> & {
  /** Required: it is what lets a password manager fill the field or offer to save it. */
  autoComplete: 'current-password' | 'new-password';
};

/** Room on the right for the button, there before it is drawn so nothing moves. */
const PASSWORD_INPUT = `${INPUT} w-full pr-11`;

const noSubscription = () => () => {};

/**
 * A Field for a password, with a button that shows it. Drawn once hydrated
 * (server snapshot false, as useSpeech): without JavaScript it is the plain
 * password field, never a button that does nothing. One name with aria-pressed,
 * as Show the text; the name is sr-only text, not aria-label, which getByLabel
 * would read, so getByLabel('Password') keeps meaning the input.
 */
export function PasswordField({ label, hint, ...input }: PasswordFieldProps) {
  const t = useTranslations('Form');
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [shown, setShown] = useState(false);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  // Hidden again when the form is sent: what leaves, and what a password
  // manager sees leave, is a password field.
  useEffect(() => {
    const form = field.current?.form;
    if (!form) return;
    const hide = () => setShown(false);
    form.addEventListener('submit', hide);
    return () => form.removeEventListener('submit', hide);
  }, []);

  function toggle() {
    const input = field.current;
    if (!input) return;
    const focused = document.activeElement === input;
    const { selectionStart, selectionEnd } = input;
    // Committed now so the caret can go back: changing type can move it.
    flushSync(() => setShown((was) => !was));
    if (focused) {
      input.focus();
      input.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  return (
    <Labelled id={id} label={label} hint={hint}>
      <div className="relative">
        <input
          ref={field}
          id={id}
          aria-describedby={hint ? `${id}-hint` : undefined}
          className={hydrated ? `${PASSWORD_INPUT} [&::-ms-reveal]:hidden` : PASSWORD_INPUT}
          {...input}
          type={shown ? 'text' : 'password'}
          // Once shown it is a text field: kept from cloud spellcheckers, and
          // from phones that would capitalise or correct the password typed.
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="none"
        />
        {hydrated ? (
          <button
            type="button"
            aria-controls={id}
            aria-pressed={shown}
            disabled={input.disabled}
            // The focus stays in the field, so typing goes on after a click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggle}
            className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-slate-400 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="sr-only">{t('showPassword')}</span>
            <EyeIcon crossed={shown} />
          </button>
        ) : null}
      </div>
    </Labelled>
  );
}

/** Feather's eye and eye-off, drawn like menu-icon.tsx. Decorative: the button's text names it. */
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {crossed ? (
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
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
const OUTLINE = `${BUTTON} border-slate-700 text-slate-200 disabled:bg-transparent`;
export const SECONDARY_BUTTON = `${OUTLINE} hover:bg-slate-800`;
/** Outlined too, tinted on hover by where they lead: a fresh start, or a correction. */
export const GO_BUTTON = `${OUTLINE} hover:border-green-500/60 hover:bg-green-500/10 hover:text-green-300`;
export const WARN_BUTTON = `${OUTLINE} hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-300`;

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
