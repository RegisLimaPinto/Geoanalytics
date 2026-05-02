import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const SINGLE = {
  slug: 'single',
  name: 'Avulso',
  price: 199,
  period: '/análise',
  analyses: '1 análise',
  highlight: false,
  features: [
    '1 relatório completo',
    'Pipeline PSI Analytics',
    'Mapa de favorabilidade',
    'Exportar PDF',
    'Suporte por e-mail',
  ],
}

const PLANS = [
  {
    slug: 'basic',
    name: 'Básico',
    price: 299,
    period: '/mês',
    analyses: '5 análises/mês',
    highlight: false,
    features: [
      '5 análises mensais',
      'Pipeline PSI Analytics',
      'Mapa de favorabilidade',
      'Exportar PDF',
      'Suporte por e-mail',
    ],
  },
  {
    slug: 'pro',
    name: 'Pro',
    price: 699,
    period: '/mês',
    analyses: '15 análises/mês',
    highlight: true,
    features: [
      '15 análises mensais',
      'Pipeline PSI Analytics',
      'Mapa de favorabilidade',
      'Exportar PDF',
      'Múltiplas commodities',
      'Suporte prioritário',
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    price: 1499,
    period: '/mês',
    analyses: 'Ilimitado',
    highlight: false,
    features: [
      'Análises ilimitadas',
      'Pipeline PSI Analytics',
      'Mapa de favorabilidade',
      'Exportar PDF',
      'API Access',
      'Suporte dedicado',
      'Onboarding incluso',
    ],
  },
]

export default function Pricing() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [subscription, setSubscription] = useState(null)

  useEffect(() => {
    if (!token) return
    fetch('/api/payments/my-subscription', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setSubscription)
      .catch(() => {})
  }, [token])

  const handleBuy = async (slug) => {
    if (!user) { navigate('/login'); return }
    setLoading(slug)
    setError(null)
    try {
      const endpoint = slug === 'single' ? '/api/payments/checkout' : `/api/payments/subscribe/${slug}`
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.detail || 'Erro ao iniciar pagamento')
      }
      const data = await res.json()
      window.location.href = data.init_point
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(null)
    }
  }

  const activePlan = subscription?.plan

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16">
      <div className="text-center mb-14">
        <span className="inline-block text-xs font-semibold tracking-widest text-amber-400 uppercase mb-3 border border-amber-500/30 px-3 py-1 rounded-full">
          Planos & Preços
        </span>
        <h1 className="text-4xl font-bold text-white mb-4">
          Inteligência mineral ao seu alcance
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto">
          Escolha o plano ideal ou pague por análise. Sem contratos, cancele quando quiser.
        </p>
        {subscription?.plan && (
          <div className="inline-block mt-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm px-4 py-2 rounded-full">
            Plano ativo: <strong>{subscription.plan_name}</strong>
            {subscription.balance !== undefined && !subscription.unlimited && (
              <> · {subscription.balance} análise{subscription.balance !== 1 ? 's' : ''} disponív{subscription.balance !== 1 ? 'eis' : 'el'}</>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-center text-red-400 text-sm mb-8">{error}</p>}

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <PlanCard plan={SINGLE} isActive={false} loading={loading === 'single'} onBuy={() => handleBuy('single')} loggedIn={!!user} />
        {PLANS.map(plan => (
          <PlanCard key={plan.slug} plan={plan} isActive={activePlan === plan.slug} loading={loading === plan.slug} onBuy={() => handleBuy(plan.slug)} loggedIn={!!user} />
        ))}
      </div>

      <p className="text-center text-xs text-slate-600 mt-10">
        PIX · Cartão de crédito · Boleto · Pagamento seguro via MercadoPago
      </p>
    </div>
  )
}

function PlanCard({ plan, isActive, loading, onBuy, loggedIn }) {
  const { highlight } = plan
  const border = isActive ? 'border-emerald-500/50' : highlight ? 'border-amber-500/40' : 'border-slate-700'
  const shadow = highlight ? 'shadow-2xl shadow-amber-500/10' : ''

  return (
    <div className={`relative bg-slate-900 border ${border} ${shadow} rounded-2xl overflow-hidden flex flex-col`}>
      {highlight && !isActive && (
        <div className="absolute top-4 right-4 bg-amber-500 text-slate-900 text-xs font-bold px-2 py-1 rounded-full">POPULAR</div>
      )}
      {isActive && (
        <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full">ATIVO</div>
      )}

      <div className="p-6 flex-1 flex flex-col">
        <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">{plan.analyses}</p>
        <h2 className="text-xl font-bold text-white mb-4">{plan.name}</h2>

        <div className="flex items-end gap-1 mb-6">
          <span className="text-slate-400 text-sm">R$</span>
          <span className="text-4xl font-extrabold text-white leading-none">{plan.price}</span>
          <span className="text-slate-400 text-sm mb-1">{plan.period}</span>
        </div>

        <ul className="space-y-2.5 mb-8 flex-1">
          {plan.features.map(f => (
            <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <svg className="w-2.5 h-2.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {f}
            </li>
          ))}
        </ul>

        <button
          onClick={onBuy}
          disabled={loading || isActive}
          className={`w-full py-2.5 rounded-xl font-bold text-sm transition disabled:opacity-50 ${
            isActive
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
              : highlight
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
              : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600'
          }`}
        >
          {loading ? 'Aguarde...' : isActive ? 'Plano atual' : loggedIn ? (plan.slug === 'single' ? 'Comprar agora' : 'Assinar plano') : 'Entrar para assinar'}
        </button>
      </div>
    </div>
  )
}


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
