import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PaymentSuccess() {
  const { token } = useAuth()
  const [credits, setCredits] = useState(null)

  useEffect(() => {
    if (!token) return
    // Aguarda 2s para o webhook processar, depois atualiza saldo
    const timer = setTimeout(() => {
      fetch('/api/payments/credits', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(setCredits)
        .catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [token])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Pagamento aprovado!</h1>
        <p className="text-slate-400 mb-2">
          Sua análise foi creditada na conta. Você já pode iniciar o relatório.
        </p>
        {credits && !credits.unlimited && (
          <p className="text-amber-400 font-semibold mb-6">
            Saldo atual: {credits.balance} análise{credits.balance !== 1 ? 's' : ''}
          </p>
        )}
        <Link
          to="/analysis"
          className="inline-block mt-4 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition"
        >
          Iniciar análise
        </Link>
      </div>
    </div>
  )
}
