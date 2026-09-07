import { notFound } from 'next/navigation';

/**
 * Turns an unmatched locale-prefixed path into the translated 404 next door.
 *
 * Without it an unmatched URL falls through to the 404 Next ships, which sits
 * above [locale] and reads no catalogue: a French visitor would get an English
 * page, without the legal links, for every mistyped address. The middleware
 * prefixes every such path with a locale before routing sees it, so this
 * catch-all is what that redirect lands on.
 */
export default function CatchAllPage() {
  notFound();
}
