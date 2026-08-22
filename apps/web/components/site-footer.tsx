import Link from 'next/link';

const legalLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

/**
 * The full footer, for shells that can afford the vertical space. The app
 * shells use LegalFooter instead; both publish the links under a nav labelled
 * "Legal", so one assertion covers whichever rendered.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-slate-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-6 text-sm text-slate-400">
        <p>An academic project. Not a commercial service.</p>
        <nav aria-label="Legal">
          <ul className="flex gap-6">
            {legalLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="underline underline-offset-4 hover:text-slate-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
