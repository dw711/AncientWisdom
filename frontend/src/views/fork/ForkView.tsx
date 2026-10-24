import { useCallback, useMemo, useRef, useState } from 'react'
import type { MirrorView } from '../../data/types'
import { useMedia } from '../../lib/useMedia'
import ForkTopBar from './ForkTopBar'
import ForkHero from './ForkHero'
import YearIndex from './YearIndex'
import ForkStage, { type StageApi } from './ForkStage'
import ForkStack from './ForkStack'
import ForkEnding from './ForkEnding'
import type { Focus } from './focus'

interface Props {
  data: MirrorView
  onAsk: (dilemma: string) => void
  status: 'idle' | 'loading' | 'error'
}

export default function ForkView({ data, onAsk, status }: Props) {
  const wide = useMedia('(min-width: 1024px) and (min-height: 620px)')
  const paths = useMemo(() => data.paths.slice(0, 2), [data.paths])
  const [hover, setHover] = useState<Focus | null>(null)
  const [handleT, setHandleT] = useState(0)
  const [handleTouched, setHandleTouched] = useState(false)
  const [revealed, setRevealed] = useState<number[]>(() => paths.map(() => 0))
  const stage = useRef<StageApi | null>(null)

  const focus: Focus | null = hover ?? (handleTouched ? { source: 'handle', t: handleT } : null)
  const onHandle = useCallback((t: number) => {
    setHandleTouched(true)
    setHandleT(t)
  }, [])

  const jump = (pathId: string, index: number) => {
    if (wide) stage.current?.scrollTo(pathId, index)
    else document.querySelector(`[data-jump="${pathId}-${index}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="min-h-svh bg-cream font-inter text-ink">
      <ForkTopBar onAsk={onAsk} status={status} />
      <YearIndex paths={paths} revealed={wide ? revealed : paths.map((p) => p.events.length)} focus={focus} onHover={setHover} onJump={jump} />
      <main>
        <ForkHero data={data} />
        {wide ? (
          <ForkStage
            key={data.dilemma}
            paths={paths}
            focus={focus}
            handleT={handleT}
            onHover={setHover}
            onHandle={onHandle}
            onReveal={setRevealed}
            apiRef={stage}
          />
        ) : (
          <ForkStack paths={paths} focus={focus} handleT={handleT} onHover={setHover} onHandle={onHandle} />
        )}
        <ForkEnding data={data} />
      </main>
    </div>
  )
}
