export default function ChatPage() {
  return (
    <div className="flex h-full gap-6">
      <section className="flex flex-1 min-w-0 flex-col rounded-2xl border border-slate-200 dark:border-slate-800">
        <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <span className="font-semibold">Tutor</span>
        </header>

        <div className="flex-1 overflow-y-auto p-4">{/* liste de messages */}</div>

        <div className="border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Your message.."
              className="font-semibold flex-1 rounded-full border border-slate-200 bg-slate-100 px-5 py-3 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              type="button"
              className="font-semibold flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white dark:bg-slate-700 dark:text-slate-900"
            >
              →
            </button>
          </div>
        </div>
      </section>

      <aside className="flex w-[460px] shrink-0 flex-col items-center justify-center overflow-y-auto rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-800">
        <p className="font-semibold">Get feedback on your messages</p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          The AI will analyze your messages and give you personalized feedback.
        </p>
      </aside>
    </div>
  );
}
