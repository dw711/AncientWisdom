import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useMirror } from './data/useMirror'
import { ScrollTrigger } from './lib/gsap'
import ForkView from './views/fork/ForkView'
import PrecedentView from './views/precedent/PrecedentView'
import ViewSwitch from './components/ViewSwitch'

export default function App() {
  const { data, ask, status } = useMirror()
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
    ScrollTrigger.refresh()
  }, [pathname])

  return (
    <>
      <Routes>
        <Route path="/fork" element={<ForkView data={data} onAsk={ask} status={status} />} />
        <Route path="/precedent" element={<PrecedentView data={data} />} />
        <Route path="*" element={<Navigate to="/fork" replace />} />
      </Routes>
      <ViewSwitch />
    </>
  )
}
