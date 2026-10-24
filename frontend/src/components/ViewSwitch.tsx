import { NavLink } from 'react-router-dom'

/** Fixed bottom-left switch between the two presentations of the same data. */
export default function ViewSwitch() {
  const item = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-full transition-colors ${isActive ? 'bg-ink text-cream' : 'hover:bg-ink/10'}`
  return (
    <nav
      aria-label="Views"
      className="label font-plex fixed bottom-4 left-4 z-[70] flex gap-1 rounded-full border border-ink/80 bg-cream/90 p-1 text-ink backdrop-blur"
    >
      <NavLink to="/fork" className={item}>
        The Fork
      </NavLink>
      <NavLink to="/precedent" className={item}>
        The Precedent
      </NavLink>
    </nav>
  )
}
