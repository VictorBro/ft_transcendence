# Transcendence — Brand Guidelines

<img src="svg/logo-horizontal.svg" alt="Transcendence logo" width="480">

Open `index.html` in a browser for the visual overview.

## 1. The logo — "Next Level"

- **Idea:** a T whose right arm sits one step higher than the left (moving up
  a CEFR level, A1 → C2), with a block that has already broken away above it
  (going beyond: *transcend*). The gradient rises with the step.
- **Construction:** one grid on a 256-unit canvas. Every bar is 36 units;
  outer corners are rounded at 10, inner corners at 6, the floating block at 8.
  Every edge is horizontal or vertical.

| Version        | Files                  | Use                                          |
| -------------- | ---------------------- | -------------------------------------------- |
| Horizontal     | `logo-horizontal*.svg` | Default: headers, README, slides             |
| Stacked        | `logo-stacked*.svg`    | Square spaces: splash, posters, title slides |
| Symbol         | `symbol*.svg`          | Avatars, small UI, loaders                   |
| Small-size cut | `symbol-small*.svg`    | Below 64 px: heavier bars, no floating block |
| Wordmark       | `wordmark*.svg`        | Only when the symbol is already nearby       |
| App icon       | `app-icon*.svg`        | Gradient tile, white mark                    |
| Pattern        | `pattern-dark.svg`     | Backgrounds, banners, slide covers           |

Suffixes: none = gradient + ink wordmark, for light backgrounds · `-dark` =
gradient + white wordmark, for dark backgrounds · `-white`, `-black`, `-indigo`
= flat one-colour versions.

`png/` holds rasters, `web/` the favicon and PWA icon set, `slides/` the
presentation.

## 2. Clear space

Keep **1 × the bar width** clear on every side (36 units, 14 % of the symbol's
height). The zone scales with the logo.

## 3. Minimum size

| Version    | Screen                                         | Print |
| ---------- | ---------------------------------------------- | ----- |
| Horizontal | 140 px wide                                    | 35 mm |
| Stacked    | 72 px wide                                     | 20 mm |
| Symbol     | 64 px; below that `symbol-small` or the favicon | 8 mm  |

## 4. Colour

| Name   | HEX       | RGB         | CMYK (approx.) | Role                                |
| ------ | --------- | ----------- | -------------- | ----------------------------------- |
| Violet | `#7C3AED` | 124 58 237  | 48 76 0 7      | Gradient start                      |
| Indigo | `#4F46E5` | 79 70 229   | 66 69 0 10     | Primary flat colour, gradient middle |
| Cyan   | `#06B6D4` | 6 182 212   | 97 14 0 17     | Gradient end, the floating block     |
| Night  | `#0B0B1E` | 11 11 30    | 63 63 0 88     | Brand background                    |
| Mist   | `#C7D2FE` | 199 210 254 | 22 17 0 0      | Secondary text on Night             |
| Ink    | `#0F172A` | 15 23 42    | 64 45 0 84     | Wordmark on light, one-colour print |

**Gradient:** violet → indigo → cyan, from bottom-left to top-right, never
reversed: progress goes up.

**Approved pairs:** gradient on white or Night · white on the gradient, on
indigo or on Night · indigo or ink on white. For print, embroidery, engraving
or anything under 64 px, use a flat version.

## 5. Typography

- The wordmark is **Sora SemiBold**, tracking −3 %, converted to outlines. Use
  the files; never retype it.
- Sora is under the SIL Open Font License 1.1 (`SORA-LICENSE.txt`), which
  allows use in a logo.

## 6. Don'ts

Don't stretch, rotate or mirror the symbol (a mirrored T steps down). Don't
move or drop the floating block above 64 px. Don't reverse the gradient or add
colours, shadows, glows or outlines to the mark. Don't change the spacing or
size ratio inside a lockup. Don't place the gradient mark on a busy image;
use the white version on a Night or gradient tile.

## 7. Web icons

Not wired into the app. When the team decides to:

- `web/favicon.svg` → `apps/web/app/icon.svg`
- `web/apple-touch-icon.png` → `apps/web/app/apple-icon.png`
- `web/site.webmanifest`, `icon-192.png`, `icon-512.png` and
  `maskable-512.png` are for an installable PWA.
