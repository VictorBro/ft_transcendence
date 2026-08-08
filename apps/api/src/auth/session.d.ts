import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Set only once authentication is complete. The guard reads this. */
    userId?: string;
  }
}
