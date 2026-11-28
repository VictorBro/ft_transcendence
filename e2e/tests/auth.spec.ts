import type { Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

import {
  expect,
  identity,
  logInSlot,
  PASSWORD,
  placeCourse,
  signUp,
  signUpSlot,
  test,
} from '../support/session';
import { openMenu } from '../support/menu';

/**
 * The browser half of authentication. Supertest already proves the API, so what
 * is only provable here is that the cookie survives Caddy's TLS termination and
 * the hop between Next and NestJS: same-origin, Secure, and readable by the
 * server renderer on the very next navigation.
 */
test.describe('authentication in the browser', () => {
  /**
   * Exact labels throughout: "Password" alone also matches "Confirm password",
   * which Playwright reports as a strict mode violation rather than a guess.
   */
  const fillSignUp = async (
    page: Page,
    fields: { email: string; displayName: string; password: string; confirmPassword?: string },
  ) => {
    await page.goto('/en/signup');
    await page.getByLabel('Email', { exact: true }).fill(fields.email);
    await page.getByLabel('Display name', { exact: true }).fill(fields.displayName);
    await page.getByLabel('Password', { exact: true }).fill(fields.password);
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill(fields.confirmPassword ?? fields.password);
  };

  /**
   * Waits for the redirect home before returning. Without it, the next goto
   * races the sign-out navigation: Chromium usually lets the goto win, Firefox
   * aborts it (NS_BINDING_ABORTED) and WebKit reports it interrupted.
   */
  const signOut = async (page: Page) => {
    await openMenu(page);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/en$/);
    // The button redirects home whatever logOut() answered, so the URL alone
    // does not prove the session is gone.
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  };

  const logIn = async (page: Page, email: string) => {
    await page.goto('/en/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await logInSlot();
    await page.getByRole('button', { name: 'Sign in' }).click();
  };

  // A new account has no course, so the first thing it sees is step one.
  test('signs up, lands on onboarding, and survives a reload', async ({ page }) => {
    const { email, displayName } = identity();

    await fillSignUp(page, { email, displayName, password: PASSWORD });
    // The only test whose signup is the form's own request, so it books its
    // slot here rather than through signUp().
    await signUpSlot();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you want to learn?' }),
    ).toBeVisible();

    // The header is server-rendered, so seeing the name proves the cookie
    // reached NestJS through Next rather than only living in the browser.
    await page.reload();
    await openMenu(page);
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

    await fillSignUp(page, {
      email,
      displayName,
      password: PASSWORD,
      confirmPassword: `${PASSWORD}x`,
    });
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('do not match');
    await expect(page).toHaveURL(/\/signup$/);
  });

  // No account and no login. The email stays empty, so a submit would show the
  // form's alert: none proves the toggle is type="button". Caret handling after
  // a type change differs between the three engines, hence the selection check.
  test('shows and hides the password, keeping the focus and the caret', async ({ page }) => {
    await page.goto('/en/login');
    const password = page.getByLabel('Password', { exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });

    await password.fill(PASSWORD);
    await password.evaluate((el) => (el as HTMLInputElement).setSelectionRange(3, 3));
    await toggle.click();

    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expect(password).toHaveValue(PASSWORD);
    await expect(password).toBeFocused();
    expect(
      await password.evaluate((el) => {
        const input = el as HTMLInputElement;
        return [input.selectionStart, input.selectionEnd];
      }),
    ).toEqual([3, 3]);
    await expect(page.locator('form').getByRole('alert')).toHaveCount(0);

    await toggle.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  // focus() rather than Tab: WebKit's Tab can skip buttons.
  test('works from the keyboard and never sends the form', async ({ page }) => {
    await page.goto('/en/login');
    const password = page.getByLabel('Password', { exact: true });
    const toggle = page.getByRole('button', { name: 'Show password' });

    await password.fill(PASSWORD);
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(password).toHaveAttribute('type', 'text');
    await expect(toggle).toBeFocused();

    await page.keyboard.press('Space');
    await expect(password).toHaveAttribute('type', 'password');
    await expect(page.locator('form').getByRole('alert')).toHaveCount(0);
  });

  // LoginSchema refuses the empty email in the browser, so no login request is
  // made and no logInSlot is needed.
  test('hides the password again when the form is sent', async ({ page }) => {
    await page.goto('/en/login');
    const password = page.getByLabel('Password', { exact: true });

    await password.fill(PASSWORD);
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('form').getByRole('alert')).toBeVisible();
    await expect(password).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Show password', pressed: false })).toBeVisible();
  });

  // Both buttons have the same name, so each is found by the field it controls.
  test('each signup password has its own toggle', async ({ page }) => {
    await page.goto('/en/signup');
    const password = page.getByLabel('Password', { exact: true });
    const confirm = page.getByLabel('Confirm password', { exact: true });

    await expect(page.getByRole('button', { name: 'Show password' })).toHaveCount(2);
    await page.locator(`button[aria-controls="${await confirm.getAttribute('id')}"]`).click();

    await expect(confirm).toHaveAttribute('type', 'text');
    await expect(password).toHaveAttribute('type', 'password');
  });

  // The button is drawn once hydrated: without JavaScript it would do nothing.
  // The form posts, so Enter before hydration keeps the password out of the URL.
  test('without JavaScript the field is a plain password field', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/en/login');
      const password = page.getByLabel('Password', { exact: true });

      await expect(password).toHaveAttribute('type', 'password');
      await expect(page.getByRole('button', { name: 'Show password' })).toHaveCount(0);

      await password.fill(PASSWORD);
      const sent = page.waitForRequest((request) => request.isNavigationRequest());
      await password.press('Enter');
      const request = await sent;
      expect(request.method()).toBe('POST');
      expect(new URL(request.url()).search).toBe('');
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('signs out and loses access to the profile', async ({ page }) => {
    await signUp(page);
    await page.goto('/en/onboarding');

    await signOut(page);

    await page.goto('/en/profile');
    await expect(page).toHaveURL(/\/login$/);
  });

  /**
   * The login form only goes to /learn, which picks the page. landing.spec.ts
   * covers its other cases by visiting it directly: POST /auth/login allows 20 a
   * minute per address, and every login in the suite comes from the same one.
   */
  test('signs back in with the password and, with no course, lands on onboarding', async ({
    page,
  }) => {
    const fields = identity();

    await signUp(page, fields);
    await page.goto('/en/onboarding');
    await signOut(page);

    await logIn(page, fields.email);

    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await openMenu(page);
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(
      fields.displayName,
    );
  });

  test('signing in with a placed course opens it', async ({ page }) => {
    const fields = identity();

    await signUp(page, fields);
    await placeCourse(page, { lang: 'fr', level: 'A2', dailyGoal: 10 });
    await page.goto('/en/learn');
    await signOut(page);

    await logIn(page, fields.email);

    await expect(page).toHaveURL(/\/en\/learn\/fr$/);
    await expect(page.getByRole('heading', { level: 1, name: 'French' })).toBeVisible();
  });

  test('saves a profile edit and shows it in the header', async ({ page }) => {
    const fields = identity();
    const renamed = `${fields.displayName}x`;

    await signUp(page, fields);

    await page.goto('/en/profile');
    await page.getByRole('link', { name: 'Edit profile' }).click();
    await page.getByLabel('Display name').fill(renamed);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
    await openMenu(page);
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(renamed);
  });

  test('offers two factor enrolment with a scannable QR', async ({ page }) => {
    await signUp(page);

    await page.goto('/en/settings/2fa');
    await expect(page.getByText('Two factor authentication is off')).toBeVisible();

    await page.getByRole('button', { name: 'Set up' }).click();

    // The QR is generated server side and inlined, so there is no second request
    // to fail and nothing for the browser to render it with.
    const qr = page.getByRole('img', { name: /QR code/ });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\//);
    await expect(page.getByRole('button', { name: 'Turn on' })).toBeVisible();
  });

  // #216: not knowing the status is not "off". Showing Set up then offered
  // setup on an account whose 2FA might be on.
  test('offers no setup when the 2FA status cannot be read', async ({ page }) => {
    await signUp(page);

    let failing = true;
    await page.route('**/api/auth/2fa', (route) =>
      failing && route.request().method() === 'GET' ? route.abort() : route.fallback(),
    );

    await page.goto('/en/settings/2fa');
    await expect(page.getByText('Could not check two factor authentication.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set up' })).toHaveCount(0);

    failing = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Two factor authentication is off')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set up' })).toBeVisible();
  });

  test('a signed-out visitor is sent to the login page', async ({ page }) => {
    await page.goto('/en/settings/2fa');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('enrols in 2FA, then signs in with the code', async ({ page }) => {
    const { email, displayName } = identity();

    await signUp(page, { email, displayName });

    await page.goto('/en/settings/2fa');
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

    await signOut(page);

    await logIn(page, email);

    // The second-factor step is a different form. React reuses DOM nodes across
    // renders unless told otherwise, which once carried the typed password into
    // this field in clear text.
    const code = page.getByLabel('Authentication code');
    await expect(code).toBeVisible();
    await expect(code).toHaveValue('');

    await code.fill(totp.generate());
    await page.getByRole('button', { name: 'Verify' }).click();

    // The second step lands where the first would have: no course, so onboarding.
    await expect(page).toHaveURL(/\/en\/onboarding$/);
    await openMenu(page);
    await expect(page.getByRole('navigation', { name: 'Account' })).toContainText(displayName);
  });

  test('checks the turn-off password in the browser before sending it', async ({ page }) => {
    const fields = identity();

    await signUp(page, fields);

    await page.goto('/en/settings/2fa');
    await page.getByRole('button', { name: 'Set up' }).click();
    const secret = (await page.locator('code').innerText()).trim();
    const totp = new TOTP({
      issuer: 'ft_transcendence',
      label: fields.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    await page.getByLabel('Code from your app').fill(totp.generate());
    await page.getByRole('button', { name: 'Turn on' }).click();
    await page.getByRole('button', { name: 'I have saved them' }).click();
    await expect(page.getByText(/Two factor authentication is on/)).toBeVisible();
    // Drawn by the client after the status fetch, so the button is there at once.
    await expect(page.getByRole('button', { name: 'Show password', pressed: false })).toBeVisible();

    // The same schema as the API, so an empty password is caught without a request.
    const deletes: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'DELETE' && request.url().endsWith('/api/auth/2fa')) {
        deletes.push(request.url());
      }
    });
    await page.getByRole('button', { name: 'Turn off' }).click();
    await expect(page.getByText('Enter your password')).toBeVisible();
    expect(deletes).toEqual([]);
    await expect(page.getByText(/Two factor authentication is on/)).toBeVisible();
  });
});
