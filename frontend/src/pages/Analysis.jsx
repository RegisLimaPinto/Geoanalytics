import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TargetConfig from '../components/Analysis/TargetConfig'
import GeoMap from '../components/Map/GeoMap'
import { useAuth } from '../context/AuthContext'

const DEFAULT_CONFIG = {
  bbox: { lonMin: -41.95, latMin: -4.75, lonMax: -40.30, latMax: -3.90 },
  resolution: 0.02,
  commodity: 'OURO',
  radiusKm: 20,
  targets: [
    { id: 'T1', lon: -40.57, lat: -4.65 },
    { id: 'T2', lon: -41.58, lat: -4.30 },
    { id: 'T3', lon: -41.20, lat: -4.52 },
  ],
}

export default function Analysis() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(false)
  const [noCredits, setNoCredits] = useState(false)
  const navigate = useNavigate()
  const { token } = useAuth()

  async function handleRunAnalysis() {
    setLoading(true)
    setNoCredits(false)
    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      })
      if (res.status === 402) { setNoCredits(true); return }
      if (!res.ok) throw new Error('Backend error')
      const data = await res.json()
      navigate(`/results?job_id=${data.job_id}`)
    } catch {
      navigate('/results?demo=true')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Sidebar de configuração */}
      <aside className="w-80 flex-shrink-0 bg-slate-800/70 border-r border-slate-700 overflow-y-auto">
        <TargetConfig
          config={config}
          onChange={setConfig}
          onRun={handleRunAnalysis}
          loading={loading}
          token={token}
        />
      </aside>

      {/* Mapa principal */}
      <div className="flex-1 relative">
        <GeoMap bbox={config.bbox} targets={config.targets} />

        {/* Banner créditos insuficientes */}
        {noCredits && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-900 border border-amber-500/50 rounded-xl px-6 py-4 text-center shadow-xl max-w-sm">
            <p className="text-white font-semibold mb-1">Créditos insuficientes</p>
            <p className="text-slate-400 text-sm mb-3">Você precisa de 1 análise para continuar.</p>
            <Link to="/pricing" className="inline-block px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg text-sm transition">
              Adquirir análise — R$ 199
            </Link>
          </div>
        )}

        {/* Info overlay */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs text-slate-400 backdrop-blur space-y-0.5">
          <div>
            <span className="text-slate-500">Área: </span>
            <span className="text-white font-mono">
              {config.bbox.lonMin.toFixed(2)}° – {config.bbox.lonMax.toFixed(2)}°W /{' '}
              {config.bbox.latMin.toFixed(2)}° – {config.bbox.latMax.toFixed(2)}°S
            </span>
          </div>
          <div>
            <span className="text-slate-500">Resolução: </span>
            <span className="text-amber-400 font-mono">
              ~{(config.resolution * 111).toFixed(1)} km/pixel
            </span>
          </div>
          <div>
            <span className="text-slate-500">Alvos: </span>
            <span className="text-white font-mono">
              {config.targets.map((t) => t.id).join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
