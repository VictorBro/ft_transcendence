import { deflateSync } from 'node:zlib';

import { expect, test } from '../support/session';

/**
 * A solid-colour PNG, built rather than committed so no binary lives in the
 * repo. Whether the browser can actually decode it is the point: a header with
 * junk behind it uploads fine and then renders as a broken image.
 */
function png(): Buffer {
  const width = 64;
  const height = 64;
  const rgb = [220, 90, 60];
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      raw.set(rgb, row + 1 + x * 3);
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let c = 0xffffffff;
    for (const byte of body) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const upload = { name: 'avatar.png', mimeType: 'image/png', buffer: png() };

test.describe('avatar', () => {
  test('a signed out visitor cannot reach the edit page', async ({ page }) => {
    await page.goto('/en/profile/edit');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('uploads, renders, and removes again', async ({ signedIn }) => {
    await signedIn.goto('/en/profile/edit');

    // No upload yet, so the fallback is drawn rather than fetched.
    const drawn = signedIn.locator('main svg[aria-hidden="true"]').first();
    await expect(drawn).toBeVisible();

    await signedIn.locator('input[type=file]').setInputFiles(upload);

    const image = signedIn.locator('main img').first();
    await expect(image).toHaveAttribute('src', /\/api\/uploads\/avatars\/[0-9a-f-]+\.png/);

    // Proves the file came back, not just that the src is spelled right: this
    // fails on a 404, which is what a lost upload, a wrong static prefix or an
    // unwritable volume all look like from here. Chromium decodes a structurally
    // valid PNG with corrupt pixels happily, so it cannot speak to the contents.
    await expect
      .poll(() =>
        image.evaluate((node: HTMLImageElement) =>
          node
            .decode()
            .then(() => true)
            .catch(() => false),
        ),
      )
      .toBe(true);

    await signedIn.getByRole('button', { name: 'Remove avatar' }).click();
    await expect(drawn).toBeVisible();
    await expect(signedIn.locator('main img')).toHaveCount(0);
  });

  test('refuses a file that is not an image', async ({ signedIn }) => {
    await signedIn.goto('/en/profile/edit');
    await signedIn
      .locator('input[type=file]')
      .setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });

    // The code, translated. Not the server's own words.
    await expect(signedIn.getByText(/could not be used as an avatar/i)).toBeVisible();
    await expect(signedIn.locator('main img')).toHaveCount(0);
  });
});
