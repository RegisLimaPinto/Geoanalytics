import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PaymentSuccess() {
  const { token } = useAuth()
  const [credits, setCredits] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [searchParams] = useSearchParams()

  const isPlan = searchParams.has('plan')
  const paymentStatus = searchParams.get('status') || 'approved'
  const isPending = paymentStatus === 'pending'

  useEffect(() => {
    if (!token) return
    // Aguarda webhook processar (2s para avulso, 4s para assinatura)
    const delay = isPlan ? 4000 : 2000
    const timer = setTimeout(() => {
      fetch('/api/payments/credits', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setCredits).catch(() => {})
      fetch('/api/payments/my-subscription', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setSubscription).catch(() => {})
    }, delay)
    return () => clearTimeout(timer)
  }, [token, isPlan])

  const planNames = { basic: 'Básico', pro: 'Pro', enterprise: 'Enterprise' }
  const planParam = searchParams.get('plan')

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
          isPending
            ? 'bg-amber-500/20 border border-amber-500/40'
            : 'bg-green-500/20 border border-green-500/40'
        }`}>
          {isPending ? (
            <svg className="w-10 h-10 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>

        {isPending ? (
          <>
            <h1 className="text-3xl font-bold text-white mb-3">Pagamento em análise</h1>
            <p className="text-slate-400 mb-6">
              Seu pagamento está sendo processado. Você receberá uma confirmação em breve.
              Os créditos serão adicionados automaticamente após a aprovação.
            </p>
          </>
        ) : isPlan ? (
          <>
            <h1 className="text-3xl font-bold text-white mb-3">Assinatura ativada!</h1>
            <p className="text-slate-400 mb-2">
              Plano <span className="text-amber-400 font-semibold">{planNames[planParam] || planParam}</span> ativado com sucesso.
            </p>
            {subscription?.plan && (
              <p className="text-slate-500 text-sm mb-6">
                {subscription.analyses_per_month === -1
                  ? 'Análises ilimitadas disponíveis'
                  : `${subscription.analyses_per_month} análises/mês`}
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-white mb-3">Pagamento aprovado!</h1>
            <p className="text-slate-400 mb-2">
              Sua análise foi creditada na conta. Você já pode iniciar o relatório.
            </p>
            {credits && !credits.unlimited && (
              <p className="text-amber-400 font-semibold mb-2">
                Saldo atual: {credits.balance} análise{credits.balance !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}

        <Link
          to="/analysis"
          className="inline-block mt-4 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition"
        >
          Iniciar análise
        </Link>
        <Link to="/pricing" className="block mt-3 text-sm text-slate-500 hover:text-slate-400 transition">
          Ver planos
        </Link>
      </div>
    </div>
  )
}
