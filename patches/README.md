The @nestjs/throttler 6.5.0 patch scopes expiry timers to both the storage key
and throttler name. Upstream's block reset cancels every timer with the same
throttler name, leaving unrelated buckets with hits that never expire.

This can reject signups even when the browser suite respects its 10/minute
budget, after an unrelated lesson request has hit and waited out its limit.
No rate limits or block durations are changed.

Keep apps/api/src/throttler/throttler-storage.spec.ts when upgrading the
dependency; remove the patch once the unpatched version passes that regression.
