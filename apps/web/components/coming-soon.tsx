export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 border-slate-200 p-6 text-center dark:border-slate-800">
      <p className="font-semibold text-6xl">{title}</p>
      <p className="max-w-sm text-2xl text-slate-500 dark:text-slate-400">
        This mode is still in development. Check back soon.
      </p>
    </div>
  );
}
