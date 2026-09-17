import { NavLink, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`site-nav${scrolled ? ' scrolled' : ''}`}>
      <Link to="/" className="brand" onClick={() => setOpen(false)}>
        <span className="brand-mark">K</span>
        Kudi
      </Link>

      <nav className={`nav-links${open ? ' open' : ''}`}>
        <NavLink to="/" end onClick={() => setOpen(false)}>
          Home
        </NavLink>
        <NavLink to="/send" onClick={() => setOpen(false)}>
          Send
        </NavLink>
        <NavLink to="/recipients" onClick={() => setOpen(false)}>
          Recipients
        </NavLink>
        <NavLink to="/activity" onClick={() => setOpen(false)}>
          Activity
        </NavLink>
      </nav>

      <div className="nav-cta">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
        <Link to="/send" className="btn btn-primary" onClick={() => setOpen(false)}>
          Send money
        </Link>
      </div>
    </header>
  )
}
