export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-7 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-700 animate-pulse" />
        <div className="h-4 w-72 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse mt-2" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-6 py-5 h-28 animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
