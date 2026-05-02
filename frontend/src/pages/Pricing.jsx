import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PRODUCT = {
  title: 'Análise Avulsa',
  subtitle: 'Relatório completo de prospecção mineral',
  price: 199,
  features: [
    'Pipeline GeoProspecting completo',
    'Índice PSI por área de interesse',
    'Mapa de favorabilidade mineral',
    'Relatório PDF exportável',
    'Pontos de interesse personalizados',
    'Suporte por e-mail',
  ],
}

export default function Pricing() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleBuy = async () => {
    if (!user) { navigate('/login'); return }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Erro ao iniciar pagamento')
      }
      const data = await res.json()
      // Redireciona para o checkout do MercadoPago
      window.location.href = data.init_point
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <span className="inline-block text-xs font-semibold tracking-widest text-amber-400 uppercase mb-3 border border-amber-500/30 px-3 py-1 rounded-full">
          Planos & Preços
        </span>
        <h1 className="text-4xl font-bold text-white mb-4">
          Inteligência mineral ao seu alcance
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto">
          Sem mensalidades. Pague somente quando precisar de uma análise.
        </p>
      </div>

      {/* Card */}
      <div className="relative w-full max-w-sm bg-slate-900 border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Badge */}
        <div className="absolute top-4 right-4 bg-amber-500 text-slate-900 text-xs font-bold px-2 py-1 rounded-full">
          MAIS POPULAR
        </div>

        <div className="p-8">
          <p className="text-slate-400 text-sm mb-1">{PRODUCT.subtitle}</p>
          <h2 className="text-2xl font-bold text-white mb-1">{PRODUCT.title}</h2>

          {/* Price */}
          <div className="flex items-end gap-1 my-6">
            <span className="text-slate-400 text-lg">R$</span>
            <span className="text-5xl font-extrabold text-white leading-none">
              {PRODUCT.price}
            </span>
            <span className="text-slate-400 text-sm mb-1">/análise</span>
          </div>

          {/* Features */}
          <ul className="space-y-3 mb-8">
            {PRODUCT.features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {f}
              </li>
            ))}
          </ul>

          {/* CTA */}
          {error && (
            <p className="text-red-400 text-sm mb-4 text-center">{error}</p>
          )}
          <button
            onClick={handleBuy}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-900 font-bold text-base transition"
          >
            {loading ? 'Aguarde...' : user ? 'Comprar agora — R$ 199' : 'Entrar para comprar'}
          </button>

          {/* Payment methods */}
          <p className="text-center text-xs text-slate-500 mt-4">
            PIX · Cartão de crédito · Boleto
          </p>
        </div>

        {/* Bottom bar */}
        <div className="bg-slate-800/60 px-8 py-4 flex items-center gap-2 text-xs text-slate-400">
          <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Pagamento seguro via MercadoPago
        </div>
      </div>

      {/* Credits info */}
      {user && (
        <CreditsWidget token={token} />
      )}
    </div>
  )
}

function CreditsWidget({ token }) {
  const [credits, setCredits] = useState(null)

  useState(() => {
    fetch('/api/payments/credits', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setCredits)
      .catch(() => {})
  }, [])

  if (!credits) return null

  return (
    <div className="mt-8 text-center text-sm text-slate-400">
      Seu saldo:{' '}
      <span className="text-amber-400 font-semibold">
        {credits.unlimited ? '∞ ilimitado (admin)' : `${credits.balance} análise${credits.balance !== 1 ? 's' : ''}`}
      </span>
    </div>
  )
}
