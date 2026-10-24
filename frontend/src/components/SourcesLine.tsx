import { shortSource } from '../data/normalize'

export default function SourcesLine({ sources, className = '' }: { sources: string[]; className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed ${className}`}>
      <span className="label mr-2">Sources</span>
      {sources.map((s, i) => (
        <span key={s}>
          <a href={s} target="_blank" rel="noreferrer" className="break-all underline decoration-1 underline-offset-2 hover:opacity-70">
            {shortSource(s)}
          </a>
          {i < sources.length - 1 && <span aria-hidden> · </span>}
        </span>
      ))}
    </p>
  )
}
