'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DisableTwoFactorSchema,
  EnableTwoFactorSchema,
  TwoFactorStatusSchema,
  type TwoFactorStatus,
} from '@ft/shared';
import { clientGet, type ApiResult } from '@/lib/api-client';
import { beginTwoFactorSetup, disableTwoFactor, enableTwoFactor } from '@/lib/auth-client';

import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, PasswordField, SubmitButton } from '@/components/form';

type Setup = { secret: string; otpauthUri: string; qrDataUrl: string };

/**
 * Not knowing is not "off" (#216): a page that showed Set up while the status
 * loaded, or after it failed, offered setup on an account whose 2FA was on.
 */
type Status = TwoFactorStatus | 'loading' | 'failed';

async function loadStatus(): Promise<Status> {
  const response = await clientGet(TwoFactorStatusSchema, '/api/auth/2fa');
  return response.ok ? response.data : 'failed';
}

export function TwoFactorPanel() {
  const t = useTranslations('TwoFactorPanel');
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<Status>('loading');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void loadStatus().then(setStatus);
  }, []);

  function fail(result: ApiResult<unknown>) {
    setError(result.ok ? null : errorMessage(result.code, result.status));
    return result.ok;
  }

  /** The page was out of date: 2FA is on (another tab). Show what is true now. */
  async function staleOnConflict(result: ApiResult<unknown>) {
    if (!result.ok && result.code === 'twoFactor.alreadyEnabled') {
      setSetup(null);
      setStatus(await loadStatus());
    }
  }

  async function retry() {
    setStatus('loading');
    setStatus(await loadStatus());
  }

  async function startSetup() {
    setPending(true);
    try {
      const result = await beginTwoFactorSetup();
      if (fail(result) && result.ok) {
        setSetup(result.data);
      }
      await staleOnConflict(result);
    } finally {
      setPending(false);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const code = String(new FormData(event.currentTarget).get('code') ?? '');
      const parsed = EnableTwoFactorSchema.safeParse({ code });
      if (!parsed.success) {
        setError(errorMessage(parsed.error.issues[0].message));
        return;
      }

      const result = await enableTwoFactor(parsed.data.code);
      if (fail(result) && result.ok) {
        setRecoveryCodes(result.data.recoveryCodes);
        setSetup(null);
        setStatus(await loadStatus());
      }
      await staleOnConflict(result);
    } finally {
      setPending(false);
    }
  }

  async function turnOff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const password = String(new FormData(event.currentTarget).get('password') ?? '');
      // The schema the API applies, so an empty password never leaves the page.
      const parsed = DisableTwoFactorSchema.safeParse({ password });
      if (!parsed.success) {
        setError(errorMessage(parsed.error.issues[0].message));
        return;
      }

      const result = await disableTwoFactor(parsed.data.password);
      if (fail(result)) {
        setRecoveryCodes(null);
        setStatus(await loadStatus());
      }
    } finally {
      setPending(false);
    }
  }

  // Shown once, never retrievable again, so it outranks whatever else is on screen.
  if (recoveryCodes !== null) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t('saveRecoveryCodesHeading')}</h2>
        <p className="text-sm text-slate-300">{t('recoveryCodesIntro')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-md border border-slate-800 p-4 font-mono text-sm">
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRecoveryCodes(null)}
          className="self-start rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
        >
          {t('savedThem')}
        </button>
      </section>
    );
  }

  if (setup !== null) {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-5" noValidate>
        <h2 className="text-lg font-medium">{t('scanHeading')}</h2>
        <Image
          src={setup.qrDataUrl}
          alt={t('qrAlt')}
          width={200}
          height={200}
          className="rounded-md border border-slate-800"
        />
        <p className="text-sm text-slate-300">
          {t('cannotScan')} <code className="font-mono text-xs break-all">{setup.secret}</code>
        </p>
        <Field
          label={t('codeFromApp')}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>{t('turnOn')}</SubmitButton>
      </form>
    );
  }

  if (status === 'loading') {
    return (
      <p role="status" className="text-sm text-slate-300">
        {t('loading')}
      </p>
    );
  }

  if (status === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <FormError message={t('statusUnavailable')} />
        <button
          type="button"
          onClick={() => void retry()}
          className="self-start rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  if (status.enabled) {
    return (
      <form method="post" onSubmit={turnOff} className="flex flex-col gap-5" noValidate>
        <p role="status" className="text-sm text-green-400">
          {t('enabledStatus', { count: status.recoveryCodesRemaining })}
        </p>
        <PasswordField
          label={t('confirmPasswordToTurnOff')}
          name="password"
          autoComplete="current-password"
          required
        />
        <FormError message={error} />
        <SubmitButton pending={pending}>{t('turnOff')}</SubmitButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-300">{t('disabledStatus')}</p>
      <FormError message={error} />
      <button
        type="button"
        onClick={() => void startSetup()}
        disabled={pending}
        className="self-start rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-60"
      >
        {pending ? t('working') : t('setUp')}
      </button>
    </div>
  );
}
