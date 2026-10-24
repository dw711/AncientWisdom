export default function Dateline() {
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="label font-fragment grid grid-cols-1 gap-1 border-b border-press/40 py-2.5 text-center text-press sm:grid-cols-3 sm:text-left">
      <span>Vol. I · OxHack edition</span>
      <span className="sm:text-center">以古为鉴 — Use the past as a mirror</span>
      <time dateTime={new Date().toISOString().slice(0, 10)} className="sm:text-right">
        {today}
      </time>
    </div>
  )
}
