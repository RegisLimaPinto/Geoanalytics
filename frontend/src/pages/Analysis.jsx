import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TargetConfig from '../components/Analysis/TargetConfig'
import GeoMap from '../components/Map/GeoMap'

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
  const navigate = useNavigate()

  async function handleRunAnalysis() {
    setLoading(true)
    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error('Backend error')
      const data = await res.json()
      navigate(`/results?job_id=${data.job_id}`)
    } catch {
      // Backend não disponível — navegar para demo
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
        />
      </aside>

      {/* Mapa principal */}
      <div className="flex-1 relative">
        <GeoMap bbox={config.bbox} targets={config.targets} />

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
