/**
 * The header menu's row icons, in one 24px slot each, so every row's title
 * starts at the same x. Decorative: the row's text names it.
 */
const PATHS = {
  course: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  friends: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  messages: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  signOut: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

export function MenuIcon({
  name,
  className = '',
}: {
  name: keyof typeof PATHS;
  className?: string;
}) {
  return (
    <span
      className={`size-6 shrink-0 items-center justify-center text-slate-400 ${className || 'flex'}`}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="size-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PATHS[name]}
      </svg>
    </span>
  );
}

/** One row of the header menu: full width, a comfortable tap height. */
export const MENU_ROW =
  'flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60';
