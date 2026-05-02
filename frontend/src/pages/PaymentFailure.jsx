import { Link } from 'react-router-dom'

export default function PaymentFailure() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">Pagamento não aprovado</h1>
        <p className="text-slate-400 mb-6">
          Houve um problema com o seu pagamento. Nenhum valor foi cobrado.
        </p>
        <Link
          to="/pricing"
          className="inline-block px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition"
        >
          Tentar novamente
        </Link>
      </div>
    </div>
  )
}
