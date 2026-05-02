import {
    BeakerIcon,
    ChartBarIcon,
    MapIcon,
} from '@heroicons/react/24/outline'
import { Link, useLocation } from 'react-router-dom'

const NAV = [
  { to: '/', label: 'Início', Icon: MapIcon },
  { to: '/analysis', label: 'Análise', Icon: BeakerIcon },
  { to: '/results', label: 'Resultados', Icon: ChartBarIcon },
]

export default function Header() {
  const { pathname } = useLocation()

  return (
    <header className="bg-slate-900/95 backdrop-blur border-b border-slate-700/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-lg tracking-tight select-none">
          <span className="text-2xl">🪨</span>
          <span className="text-white">
            Geo<span className="text-amber-400">Analytics</span>
          </span>
          <span className="hidden sm:inline-block ml-1 text-xs font-normal text-slate-500 border border-slate-700 rounded px-1.5 py-0.5">
            v0.1
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex items-center gap-1">
          {NAV.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                pathname === to
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
