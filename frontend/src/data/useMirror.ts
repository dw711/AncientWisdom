import { useCallback, useState } from 'react'
import mock from './mirror.mock.json'
import { normalize } from './normalize'
import type { Mirror, MirrorView } from './types'

/**
 * Where real data comes from. Set VITE_MIRROR_API to a backend that accepts
 * POST { dilemma } and returns a `Mirror` (see types.ts). Without it the mock
 * is used and "New dilemma" just echoes your text back over the mock paths.
 */
const API = import.meta.env.VITE_MIRROR_API as string | undefined

export function useMirror() {
  const [data, setData] = useState<MirrorView>(() => normalize(mock as Mirror))
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const ask = useCallback(async (dilemma: string) => {
    if (!API) {
      setData(normalize({ ...(mock as Mirror), dilemma }))
      return
    }
    setStatus('loading')
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dilemma }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setData(normalize((await res.json()) as Mirror))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  return { data, status, ask }
}
