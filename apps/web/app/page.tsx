import { buildApiUrl, fetchHello, HELLO_PATH } from '@/lib/api';

// The handshake below must reflect the API as it is right now, not as it was
// when the image was built, so this page is never prerendered.
export const dynamic = 'force-dynamic';

const runtimeSplit = [
  {
    id: 'web',
    name: 'web',
    stack: 'Next.js 16, React 19',
    role: 'Presentation and server rendering. No database access, no domain logic.',
  },
  {
    id: 'api',
    name: 'api',
    stack: 'NestJS 11',
    role: 'All business logic and data access, reached over the internal network.',
  },
];

export default async function HomePage() {
  const baseUrl = process.env.API_INTERNAL_URL;
  const endpoint = buildApiUrl(baseUrl, HELLO_PATH);
  const hello = await fetchHello({ baseUrl });
  const reachable = hello.status === 'ok';

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Learn a language with a tutor that adapts to you
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-slate-600 dark:text-slate-300">
          ft_transcendence generates lessons, grades your answers, tracks the level it infers from
          them, and pairs you with another learner for live practice. This page is the skeleton:
          everything below is wiring, not product.
        </p>
      </section>

      <section aria-labelledby="handshake" className="flex flex-col gap-4">
        <h2 id="handshake" className="text-sm font-semibold tracking-wide uppercase">
          API handshake
        </h2>

        <div className="rounded-lg border border-slate-200 p-6 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                reachable
                  ? 'rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              }
            >
              {reachable ? 'connected' : 'unavailable'}
            </span>
            <code className="font-mono text-sm break-all text-slate-500 dark:text-slate-400">
              {endpoint}
            </code>
          </div>

          <p className="mt-4 leading-relaxed text-slate-700 dark:text-slate-200">
            {hello.status === 'ok'
              ? hello.payload.message
              : `The API did not answer: ${hello.reason}. The page still renders, which is the point.`}
          </p>

          {hello.status === 'ok' && hello.payload.service !== undefined ? (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Served by {hello.payload.service}.
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="split" className="flex flex-col gap-4">
        <h2 id="split" className="text-sm font-semibold tracking-wide uppercase">
          Which runtime owns what
        </h2>
        <dl className="flex flex-col gap-4">
          {runtimeSplit.map((service) => (
            <div
              key={service.id}
              className="rounded-lg border border-slate-200 p-5 dark:border-slate-800"
            >
              <dt className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm font-semibold">{service.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{service.stack}</span>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {service.role}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
