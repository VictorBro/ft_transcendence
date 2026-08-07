/**
 * @ft/shared is the contract layer.
 *
 * The subject requires every user input to be validated on the server and, where
 * a form exists, on the client too. Writing those rules twice guarantees the two
 * copies drift apart. So each payload that crosses the network is declared once
 * here as a Zod schema: NestJS parses requests with it, Next parses form input
 * and API responses with it, and both derive their TypeScript types from the same
 * `z.infer`. One edit, both sides.
 *
 * This package is a leaf. It must never import from apps/*.
 */
export * from './events';
export * from './schemas';
