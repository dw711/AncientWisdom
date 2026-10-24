import { useRef, useState } from 'react'

interface Props {
  onAsk: (dilemma: string) => void
  status: 'idle' | 'loading' | 'error'
}

export default function ForkTopBar({ onAsk, status }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')

  return (
    <header className="sticky top-0 z-50 h-[52px] border-b border-ink bg-cream">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between px-4 md:px-12">
        <a href="/fork" className="label font-plex text-ink">
          <span className="font-inter text-[13px] font-semibold tracking-normal">以古为鉴</span>
          <span className="max-sm:sr-only">
            <span className="mx-2 text-ink/40">/</span>
            Mirror of the past
          </span>
        </a>
        <nav aria-label="Main" className="label font-plex flex items-center gap-4 whitespace-nowrap md:gap-8">
          <button type="button" onClick={() => dialog.current?.showModal()} className="uppercase hover:underline">
            New dilemma
          </button>
          <a href="#library" aria-disabled="true" title="Coming soon" className="hidden text-ink/45 sm:inline">
            Library
          </a>
          <a href="#method" className="hover:underline">
            Method
          </a>
        </nav>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="new-dilemma-title"
        className="m-auto w-[min(640px,calc(100vw-32px))] border border-ink bg-cream p-0 text-ink backdrop:bg-ink/60"
      >
        <form
          method="dialog"
          className="flex flex-col gap-4 p-6 md:p-8"
          onSubmit={() => {
            if (text.trim()) onAsk(text.trim())
            window.scrollTo({ top: 0 })
          }}
        >
          <h2 id="new-dilemma-title" className="font-playfair text-3xl italic">
            What are you deciding?
          </h2>
          <label className="label font-plex text-ink/70" htmlFor="dilemma-input">
            Describe the choice and what's pulling you each way
          </label>
          <textarea
            id="dilemma-input"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="resize-none border border-ink/40 bg-transparent p-3 font-inter text-[15px] focus:border-ink focus:outline-none"
            placeholder="My parents expect me to…"
          />
          {status === 'error' && <p className="font-inter text-sm text-[#E2401C]">Couldn't reach the mirror. Try again.</p>}
          <div className="label font-plex flex justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className="px-4 py-2 hover:underline">
              Cancel
            </button>
            <button type="submit" className="rounded-full bg-ink px-5 py-2 text-cream hover:bg-ink/85">
              {status === 'loading' ? 'Looking…' : 'Find two lives'}
            </button>
          </div>
        </form>
      </dialog>
    </header>
  )
}
