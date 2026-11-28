/**
 * Google's 429 bodies, as the Gemini specs feed them to the provider.
 *
 * DAY_QUOTA_BODY is what a free key got on 2026-11-27, once its 20 requests of
 * the day on gemini-3.6-flash were spent. MINUTE_QUOTA_BODY is the same refusal
 * written for the quota of the minute: another quotaId and limit, a wait of seconds.
 */
const quotaBody = (quotaId: string, quotaValue: string, retryDelay: string) => ({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan and billing details.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
            quotaId,
            quotaDimensions: { location: 'global', model: 'gemini-3.6-flash' },
            quotaValue,
          },
        ],
      },
      {
        '@type': 'type.googleapis.com/google.rpc.Help',
        links: [
          {
            description: 'Learn more about Gemini API quotas',
            url: 'https://aistudio.google.com/docs/rate-limits',
          },
        ],
      },
      { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
    ],
  },
});

export const DAY_QUOTA_BODY = quotaBody(
  'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
  '20',
  '48933s',
);
export const MINUTE_QUOTA_BODY = quotaBody(
  'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
  '5',
  '21s',
);
