import { SparklesIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('As senhas não coincidem'); return }
    if (form.password.length < 6) { setError('Senha deve ter ao menos 6 caracteres'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || 'Erro ao cadastrar'); return }
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
          <p className="text-slate-400 text-sm">Crie sua conta para começar</p>
        </div>

        <form onSubmit={handle} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-8 space-y-5 backdrop-blur">
          <h2 className="text-xl font-semibold text-white">Criar conta</h2>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Nome completo</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="Seu nome"
            />
          </div>

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
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <div>
            <label className="text-sm text-slate-300 mb-1.5 block">Confirmar senha</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              className="w-full bg-slate-900/60 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
              placeholder="Repita a senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-semibold rounded-lg py-2.5 transition"
          >
            {loading ? 'Criando conta...' : 'Criar conta'}
          </button>

          <p className="text-center text-sm text-slate-400">
            Já tem conta?{' '}
            <Link to="/login" className="text-amber-400 hover:text-amber-300 transition">
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
