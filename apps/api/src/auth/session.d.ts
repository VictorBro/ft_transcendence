import 'express-session';

declare module 'express-session' {
  interface SessionData {
    /** Set only once authentication is complete. The guard reads this. */
    userId?: string;

    /**
     * The password was right but a second factor is still owed. Deliberately a
     * different key from userId, so a half-finished login can never satisfy the
     * guard by accident.
     */
    pendingUserId?: string;
  }
}
