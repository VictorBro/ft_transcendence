'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EnableTwoFactorSchema, type TwoFactorStatus } from '@ft/shared';

import {
  beginTwoFactorSetup,
  disableTwoFactor,
  enableTwoFactor,
  type ApiResult,
} from '@/lib/auth-client';
import { useErrorMessage } from '@/lib/error-message';
import { Field, FormError, SubmitButton } from '@/components/form';

type Setup = { secret: string; otpauthUri: string; qrDataUrl: string };

async function loadStatus(): Promise<TwoFactorStatus | null> {
  const response = await fetch('/api/auth/2fa', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  }).catch(() => null);
  return response?.ok ? ((await response.json()) as TwoFactorStatus) : null;
}

export function TwoFactorPanel() {
  const t = useTranslations('TwoFactorPanel');
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
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

  async function startSetup() {
    setPending(true);
    try {
      const result = await beginTwoFactorSetup();
      if (fail(result) && result.ok) {
        setSetup(result.data);
      }
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
    } finally {
      setPending(false);
    }
  }

  async function turnOff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const password = String(new FormData(event.currentTarget).get('password') ?? '');
      const result = await disableTwoFactor(password);
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
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('recoveryCodesIntro')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-4 font-mono text-sm dark:border-slate-800">
          {recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRecoveryCodes(null)}
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
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
          unoptimized
          className="rounded-md border border-slate-200 dark:border-slate-800"
        />
        <p className="text-sm text-slate-600 dark:text-slate-300">
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

  if (status?.enabled) {
    return (
      <form onSubmit={turnOff} className="flex flex-col gap-5" noValidate>
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {t('enabledStatus', { count: status.recoveryCodesRemaining })}
        </p>
        <Field
          label={t('confirmPasswordToTurnOff')}
          name="password"
          type="password"
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
      <p className="text-sm text-slate-600 dark:text-slate-300">{t('disabledStatus')}</p>
      <FormError message={error} />
      <button
        type="button"
        onClick={() => void startSetup()}
        disabled={pending}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? t('working') : t('setUp')}
      </button>
    </div>
  );
}
