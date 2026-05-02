import {
    ArrowRightOnRectangleIcon,
    BeakerIcon,
    ChartBarIcon,
    MapIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  { to: '/', label: 'Início', Icon: MapIcon },
  { to: '/pricing', label: 'Preços', Icon: null },
  { to: '/analysis', label: 'Análise', Icon: BeakerIcon },
  { to: '/results', label: 'Resultados', Icon: ChartBarIcon },
]

export default function Header() {
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

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
              {Icon && <Icon className="w-4 h-4" />}
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <div className="hidden sm:flex items-center gap-1.5 text-sm text-slate-300">
                <UserCircleIcon className="w-5 h-5 text-amber-400" />
                <span className="max-w-[120px] truncate">{user.name}</span>
                {user.role === 'admin' && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">admin</span>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-2 rounded-md text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition">
                Entrar
              </Link>
              <Link to="/register" className="px-3 py-2 rounded-md text-sm bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold transition">
                Cadastrar
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
