'use client';

import type { ReactNode, Ref } from 'react';

import { SECONDARY_BUTTON } from '@/components/form';

/**
 * A question with two answers, shaped like the placement quit dialog. A
 * modal <dialog> brings the focus trap and Escape for free, and it opens
 * on the safe choice, its first button.
 */
export function ConfirmDialog({
  ref,
  label,
  children,
  no,
  yes,
  onYes,
}: {
  ref: Ref<HTMLDialogElement>;
  label: string;
  children: ReactNode;
  no: string;
  yes: string;
  onYes: () => void;
}) {
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-100 backdrop:bg-slate-950/70"
    >
      <form method="dialog" className="flex flex-col gap-6">
        <p>{children}</p>
        <div className="grid grid-cols-2 gap-3">
          <button className={SECONDARY_BUTTON}>{no}</button>
          <button
            type="button"
            onClick={onYes}
            className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400"
          >
            {yes}
          </button>
        </div>
      </form>
    </dialog>
  );
}
