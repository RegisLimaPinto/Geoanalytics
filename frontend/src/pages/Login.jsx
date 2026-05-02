import { SparklesIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = new URLSearchParams({ username: form.email, password: form.password })
      const res = await fetch('/api/auth/login', { method: 'POST', body })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Erro ao entrar'); return }
      login(data.access_token, data.user)
      navigate('/')
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-amber-400 mb-3">
            <SparklesIcon className="w-7 h-7" />
            <span className="text-2xl font-bold tracking-tight">GeoAnalytics</span>
          </div>
          <p className="text-slate-400 text-sm">Acesse sua conta para continuar</p>
        </div>

        <form onSubmit={handle} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 space-y-5 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Entrar</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">E-mail</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Senha</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg py-2.5 transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>

          <p className="text-center text-sm text-slate-400">
            Não tem conta?{' '}
            <Link to="/register" className="text-amber-400 hover:text-amber-300 transition">
              Cadastre-se
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
