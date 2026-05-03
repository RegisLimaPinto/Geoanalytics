import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CursorArrowRaysIcon, MapPinIcon, Square2StackIcon } from '@heroicons/react/24/outline'
import TargetConfig from '../components/Analysis/TargetConfig'
import GeoMap from '../components/Map/GeoMap'
import { useAuth } from '../context/AuthContext'

const DEFAULT_CONFIG = {
  bbox: { lonMin: -41.95, latMin: -4.75, lonMax: -40.30, latMax: -3.90 },
  resolution: 0.02,
  commodity: 'OURO',
  radiusKm: 20,
  targets: [],
}

function loadConfig() {
  try {
    const saved = localStorage.getItem('geo_analysis_config')
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) }
  } catch {}
  return DEFAULT_CONFIG
}

const STEPS = [
  { label: 'Conectando às fontes de dados', detail: 'CPRM · ICGEM EGM2008', duration: 8000 },
  { label: 'Normalizando camadas geofísicas', detail: 'RobustScaler · Gaussian σ=1.5', duration: 3000 },
  { label: 'Computando PSI Index', detail: 'Pesos OURO · Gradiente K · Bônus desacoplamento', duration: 3000 },
  { label: 'GeoPSI v4.0 — ajuste estatístico', detail: 'Shielding · Campo latente · Gradiente', duration: 2000 },
  { label: 'Detectando zonas prioritárias', detail: 'Contiguous high-favorability zones', duration: 2000 },
  { label: 'Gerando subalvos e análise radial', detail: 'Local maxima · P90 · Consistência', duration: 2000 },
]

function LoadingOverlay({ step }) {
  return (
    <div className="absolute inset-0 z-20 bg-slate-900/92 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-amber-400 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Pipeline GeoProspecting</p>
            <p className="text-slate-500 text-xs">Análise em andamento…</p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <div key={i} className={`flex items-start gap-3 transition-opacity duration-300 ${i > step ? 'opacity-30' : 'opacity-100'}`}>
                <div className={`mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300
                  ${done ? 'bg-emerald-500' : active ? 'bg-amber-500 ring-2 ring-amber-500/30' : 'bg-slate-700'}`}>
                  {done && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"/>}
                </div>
                <div>
                  <p className={`text-xs font-medium ${active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {s.label}
                  </p>
                  {active && (
                    <p className="text-xs text-slate-500 mt-0.5">{s.detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-6 h-1 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${Math.round(((step + 1) / STEPS.length) * 100)}%` }}
          />
        </div>
        <p className="text-right text-xs text-slate-600 mt-1">
          {Math.round(((step + 1) / STEPS.length) * 100)}%
        </p>
      </div>
    </div>
  )
}

export default function Analysis() {
  const [config, setConfig] = useState(loadConfig)
  const [loading, setLoading] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [noCredits, setNoCredits] = useState(false)
  const [mapMode, setMapMode] = useState('view')
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()
  const { token } = useAuth()

  function showToast(msg, color = 'cyan') {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2000)
  }

  // Persiste config no localStorage sempre que mudar (incluindo targets)
  useEffect(() => {
    localStorage.setItem('geo_analysis_config', JSON.stringify(config))
  }, [config])

  function handleBboxChange(bbox) {
    setConfig(c => ({ ...c, bbox }))
    setMapMode('view')
    showToast(`Area atualizada: ${bbox.lonMin.toFixed(2)} / ${bbox.latMin.toFixed(2)} → ${bbox.lonMax.toFixed(2)} / ${bbox.latMax.toFixed(2)}`, 'cyan')
  }

  function handleTargetAdd({ lon, lat }) {
    console.log('[Analysis] target add', { lon, lat })
    let newId
    setConfig(c => {
      newId = `T${c.targets.length + 1}`
      return { ...c, targets: [...c.targets, { id: newId, lon, lat }] }
    })
    // mantém modo add-target ativo para permitir múltiplos cliques (sai com Esc ou botão)
    showToast(`Ponto ${newId || ''} adicionado: ${lon.toFixed(3)}, ${lat.toFixed(3)}`, 'amber')
  }

  // Esc sai do modo de desenho/adição
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && mapMode !== 'view') setMapMode('view')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapMode])

  // Avança os steps de loading simulando o progresso real
  useEffect(() => {
    if (!loading) { setLoadStep(0); return }
    let current = 0
    setLoadStep(0)
    const timers = []
    let elapsed = 0
    STEPS.forEach((s, i) => {
      elapsed += s.duration
      timers.push(setTimeout(() => setLoadStep(i + 1), elapsed))
    })
    return () => timers.forEach(clearTimeout)
  }, [loading])

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

        {/* Toolbar de ferramentas do mapa */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex gap-1 bg-slate-900/95 border border-slate-700 rounded-lg p-1 backdrop-blur shadow-lg">
          {[
            { id: 'view', icon: CursorArrowRaysIcon, label: 'Mover' },
            { id: 'draw-bbox', icon: Square2StackIcon, label: 'Desenhar Area' },
            { id: 'add-target', icon: MapPinIcon, label: 'Adicionar Ponto' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setMapMode(id)}
              title={label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mapMode === id
                  ? id === 'draw-bbox'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                    : id === 'add-target'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                    : 'bg-slate-700 text-white border border-slate-600'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Toast de confirmacao */}
        {toast && (
          <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg text-xs font-medium backdrop-blur shadow-lg border transition-all ${
            toast.color === 'cyan'
              ? 'bg-cyan-900/95 border-cyan-500/50 text-cyan-300'
              : 'bg-amber-900/95 border-amber-500/50 text-amber-300'
          }`}>
            {toast.msg}
          </div>
        )}

        {/* Instrucao contextual */}
        {mapMode === 'draw-bbox' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-cyan-900/90 border border-cyan-500/40 text-cyan-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur">
            Clique no 1o canto da area, depois no 2o canto
          </div>
        )}
        {mapMode === 'add-target' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-amber-900/90 border border-amber-500/40 text-amber-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur">
            Clique no mapa para adicionar pontos (Esc ou Mover para sair)
          </div>
        )}

        <GeoMap
          bbox={config.bbox}
          targets={config.targets}
          radiusKm={config.radiusKm}
          mode={mapMode}
          onBboxChange={handleBboxChange}
          onTargetAdd={handleTargetAdd}
        />

        {/* Overlay de loading profissional */}
        {loading && <LoadingOverlay step={Math.min(loadStep, STEPS.length - 1)} />}

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
