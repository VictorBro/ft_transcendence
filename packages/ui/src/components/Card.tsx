import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  // Named heading, not title: `title` is already an HTMLAttributes member typed
  // as string, and widening it to ReactNode is an illegal interface extension.
  heading?: ReactNode;
  footer?: ReactNode;
}

// No 'use client': Card takes no handlers and no state, so it stays a server
// component and costs the client bundle nothing.
export function Card({ heading, footer, className, children, ...props }: CardProps) {
  return (
    <section
      className={cn('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}
      {...props}
    >
      {heading === undefined ? null : (
        <h3 className="mb-2 text-base font-semibold text-slate-900">{heading}</h3>
      )}
      <div className="text-sm text-slate-700">{children}</div>
      {footer === undefined ? null : (
        <div className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-500">{footer}</div>
      )}
    </section>
  );
}
