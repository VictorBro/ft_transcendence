import { expect, test, type Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

/**
 * The browser half of authentication. Supertest already proves the API, so what
 * is only provable here is that the cookie survives Caddy's TLS termination and
 * the hop between Next and NestJS: same-origin, Secure, and readable by the
 * server renderer on the very next navigation.
 */
test.describe('authentication in the browser', () => {
  const password = 'Correct-Horse-9';

  // Signing up writes real rows, which `make test-e2e` clears afterwards by
  // matching this prefix. Keep it in step with E2E_EMAIL_PREFIX in the Makefile.
  const identity = () => {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    return { email: `browser-${stamp}@example.com`, displayName: `browser${stamp}` };
  };

  /**
   * Exact labels throughout: "Password" alone also matches "Confirm password",
   * which Playwright reports as a strict mode violation rather than a guess.
   */
  const fillSignUp = async (
    page: Page,
    fields: { email: string; displayName: string; password: string; confirmPassword?: string },
  ) => {
    await page.goto('/signup');
    await page.getByLabel('Email', { exact: true }).fill(fields.email);
    await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
    await page.getByLabel('Password', { exact: true }).fill(fields.password);
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill(fields.confirmPassword ?? fields.password);
  };

  /** Signs up and waits for the profile, which is where a successful signup lands. */
  const createAccount = async (page: Page, fields: ReturnType<typeof identity>) => {
    await fillSignUp(page, { ...fields, password });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/profile$/);
  };

  const logIn = async (page: Page, email: string) => {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
  };

  test('signs up, lands signed in, and survives a reload', async ({ page }) => {
    const { email, displayName } = identity();

    await createAccount(page, { email, displayName });
    await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible();

    // The header is server-rendered, so seeing the name proves the cookie
    // reached NestJS through Next rather than only living in the browser.
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(displayName);
  });

  test('rejects a weak password with the shared schema message', async ({ page }) => {
    const { email, displayName } = identity();

    await fillSignUp(page, { email, displayName, password: 'short' });
    await page.getByRole('button', { name: 'Create account' }).click();

    // Scoped to the form: Next renders its own role="alert" route announcer on
    // every page, so an unscoped query matches two elements.
    await expect(page.locator('form').getByRole('alert')).toContainText('at least 12 characters');
    await expect(page).toHaveURL(/\/signup$/);
  });

  // There is no password reset, so a typo here would lock someone out of an
  // account nobody can recover.
  test('refuses a signup whose two passwords disagree', async ({ page }) => {
    const { email, displayName } = identity();

    await fillSignUp(page, { email, displayName, password, confirmPassword: `${password}x` });
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('do not match');
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('signs out and loses access to the profile', async ({ page }) => {
    const { email, displayName } = identity();

    await createAccount(page, { email, displayName });

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs back in with the password', async ({ page }) => {
    const { email, displayName } = identity();

    await createAccount(page, { email, displayName });
    await page.getByRole('button', { name: 'Sign out' }).click();

    await logIn(page, email);

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible();
  });

  test('saves a profile edit and shows it in the header', async ({ page }) => {
    const { email, displayName } = identity();
    const renamed = `${displayName}x`;

    await createAccount(page, { email, displayName });

    await page.getByLabel('Display name').fill(renamed);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('status')).toContainText('Profile saved');
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(renamed);
  });

  test('offers two factor enrolment with a scannable QR', async ({ page }) => {
    const { email, displayName } = identity();

    await createAccount(page, { email, displayName });

    await page.goto('/settings/2fa');
    await expect(page.getByText('Two factor authentication is off')).toBeVisible();

    await page.getByRole('button', { name: 'Set up' }).click();

    // The QR is generated server side and inlined, so there is no second request
    // to fail and nothing for the browser to render it with.
    const qr = page.getByRole('img', { name: /QR code/ });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\//);
    await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
  });

  test('a signed-out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/settings/2fa');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('enrols in 2FA, then signs in with the code', async ({ page }) => {
    const { email, displayName } = identity();

    await createAccount(page, { email, displayName });

    await page.goto('/settings/2fa');
    await page.getByRole('button', { name: 'Set up' }).click();

    // The secret is offered for manual entry, which lets the test act as the
    // authenticator app would.
    const secret = (await page.locator('code').innerText()).trim();
    const totp = new TOTP({
      issuer: 'ft_transcendence',
      label: email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });

    await page.getByLabel('Code from your app').fill(totp.generate());
    await page.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();

    await logIn(page, email);

    // The second-factor step is a different form. React reuses DOM nodes across
    // renders unless told otherwise, which once carried the typed password into
    // this field in clear text.
    const code = page.getByLabel('Authentication code');
    await expect(code).toBeVisible();
    await expect(code).toHaveValue('');

    await code.fill(totp.generate());
    await page.getByRole('button', { name: 'Verify' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: displayName })).toBeVisible();
  });
});
