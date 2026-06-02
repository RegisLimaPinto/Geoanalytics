import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CursorArrowRaysIcon, MapPinIcon, Square2StackIcon } from '@heroicons/react/24/outline'
import TargetConfig from '../components/Analysis/TargetConfig'
import GeoMap from '../components/Map/GeoMap'
import { useAuth } from '../context/AuthContext'

const DEFAULT_CONFIG = {
  bbox: { lonMin: 0, latMin: 0, lonMax: 0, latMax: 0 },
  resolution: 0.02,
  commodity: 'OURO',
  radiusKm: 5,
  targets: [],
}

function sanitizeConfig(rawConfig = {}) {
  const radiusKm = Math.min(5, Math.max(1, Number(rawConfig.radiusKm ?? DEFAULT_CONFIG.radiusKm)))
  const resolution = Math.min(0.05, Math.max(0.005, Number(rawConfig.resolution ?? DEFAULT_CONFIG.resolution)))
  return {
    ...DEFAULT_CONFIG,
    ...rawConfig,
    radiusKm,
    resolution,
  }
}

function sanitizePersistedConfig(rawConfig = {}) {
  return {
    ...sanitizeConfig(rawConfig),
    bbox: DEFAULT_CONFIG.bbox,
    targets: [],  // nunca restaura pontos da sessão anterior
  }
}

function loadConfig() {
  try {
    const saved = localStorage.getItem('geo_analysis_config')
    if (saved) {
      const parsed = JSON.parse(saved)
      // Garante máximo de 5 pontos ao carregar sessão anterior
      if (parsed.targets && parsed.targets.length > 5) {
        parsed.targets = parsed.targets.slice(0, 5)
      }
      return sanitizePersistedConfig(parsed)
    }
  } catch {}
  return DEFAULT_CONFIG
}

function serializeConfig(config) {
  return JSON.stringify(sanitizePersistedConfig(config))
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

function DisclaimerModal({ onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false)
  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm px-4">
      <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-7 max-w-lg w-full shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl">
            ⚠
          </div>
          <div>
            <p className="text-white font-bold text-base">Indicativo Metodológico</p>
            <p className="text-slate-400 text-xs">PSI Analytics — Leia antes de executar a análise</p>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 space-y-3 mb-5 leading-relaxed max-h-64 overflow-y-auto">
          <p>
            Os resultados gerados por esta plataforma (<strong className="text-amber-400">PSI Index, mapas de favorabilidade e ranking de alvos</strong>) têm caráter estritamente <strong>indicativo e exploratório</strong>.
          </p>
          <p>
            As informações produzidas pelo pipeline <strong>não constituem</strong>:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-400 pl-2">
            <li>Laudo geológico ou relatório técnico certificado</li>
            <li>Estimativa de teor ou reserva mineral</li>
            <li>Garantia de ocorrência de mineralização</li>
            <li>Documento substitutivo para licenciamento ou pesquisa mineral junto à ANM</li>
          </ul>
          <p>
            As indicações de favorabilidade são calculadas a partir de dados geofísicos e radiométricos públicos e/ou fornecidos pelo usuário, e são <strong>insuficientes por si só para justificar investimentos em mineração</strong> sem estudos complementares de campo.
          </p>
          <p className="text-amber-300/80">
            A PSI Analytics não se responsabiliza por decisões de investimento, pesquisa mineral ou licenciamento baseadas exclusivamente nos resultados desta plataforma.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer group mb-6">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-500 flex-shrink-0 cursor-pointer"
          />
          <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
            Li e compreendi que os resultados são <strong className="text-amber-400">indicativos</strong> e não substituem estudos geológicos complementares ou laudos técnicos certificados.
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-600 text-slate-400 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors ${
              checked
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-900'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            }`}
          >
            Confirmar e Executar
          </button>
        </div>
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
  const [bboxWarning, setBboxWarning] = useState(null)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const pendingConfigRef = useRef(null)  // config resolvido (com bbox inferida) para o confirm usar
  const navigate = useNavigate()
  const { token } = useAuth()
  const bboxDefined = Math.abs(config.bbox.lonMax - config.bbox.lonMin) > 0.001 && Math.abs(config.bbox.latMax - config.bbox.latMin) > 0.001

  function showToast(msg, color = 'cyan') {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2000)
  }

  // Persiste config no localStorage sempre que mudar (incluindo targets)
  useEffect(() => {
    localStorage.setItem('geo_analysis_config', serializeConfig(config))
  }, [config])

  function handleBboxChange(bbox) {
    setConfig(c => ({ ...c, bbox }))
    setMapMode('view')
    showToast(`Area atualizada: ${bbox.lonMin.toFixed(2)} / ${bbox.latMin.toFixed(2)} → ${bbox.lonMax.toFixed(2)} / ${bbox.latMax.toFixed(2)}`, 'cyan')
  }

  function handleTargetAdd({ lon, lat }) {
    console.log('[Analysis] target add', { lon, lat })
    if (config.targets.length >= 5) {
      showToast('Limite de 5 pontos atingido', 'red')
      return
    }
    let newId
    setConfig(c => {
      if (c.targets.length >= 5) return c
      newId = `T${c.targets.length + 1}`
      return { ...c, targets: [...c.targets, { id: newId, lon, lat }] }
    })
    // mantém modo add-target ativo para permitir múltiplos cliques (sai com Esc ou botão)
    showToast(`Ponto ${newId || ''} adicionado: ${lon.toFixed(3)}, ${lat.toFixed(3)}`, 'amber')
  }

  // Click em modo view: dica de como ativar adicao de ponto
  function handleViewClick() {
    if (mapMode === 'view') {
      showToast('Selecione "Adicionar Ponto" ou "Desenhar Area" no topo do mapa primeiro', 'amber')
    }
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
    // Valida bbox antes de enviar (evita 422 do backend)
    let resolvedConfig = { ...config }
    const b = resolvedConfig.bbox
    const dLon = (b.lonMax ?? 0) - (b.lonMin ?? 0)
    const dLat = (b.latMax ?? 0) - (b.latMin ?? 0)
    const bboxMissing = dLon <= 0 || dLat <= 0 || dLon < 0.01 || dLat < 0.01

    // Se bbox não definida mas há targets: infere bbox automaticamente com margem
    if (bboxMissing && config.targets && config.targets.length > 0) {
      const lons = config.targets.map(t => t.lon)
      const lats = config.targets.map(t => t.lat)
      const margin = Math.max(0.5, (config.radiusKm ?? 5) * 0.015)
      const inferredBbox = {
        lonMin: Math.min(...lons) - margin,
        latMin: Math.min(...lats) - margin,
        lonMax: Math.max(...lons) + margin,
        latMax: Math.max(...lats) + margin,
      }
      resolvedConfig = { ...resolvedConfig, bbox: inferredBbox }
      setConfig(c => ({ ...c, bbox: inferredBbox }))
      showToast('Área inferida automaticamente a partir dos pontos', 'cyan')
    } else if (bboxMissing) {
      showToast('Defina a area de interesse antes (clique "Desenhar Area" e arraste no mapa)', 'cyan')
      setMapMode('draw-bbox')
      return
    }

    if (!config.targets || config.targets.length === 0) {
      showToast('Adicione pelo menos 1 ponto alvo no mapa', 'amber')
      setMapMode('add-target')
      return
    }
    // Verifica créditos antes de exibir o modal
    try {
      const credRes = await fetch('/api/payments/credits', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (credRes.ok) {
        const cred = await credRes.json()
        if (!cred.unlimited && (cred.balance ?? 0) < 1) {
          navigate('/pricing')
          return
        }
      }
    } catch { /* ignora erro de rede — backend vai rejeitar com 402 se necessário */ }

    pendingConfigRef.current = resolvedConfig
    // Exibe modal de aviso metodológico antes de executar
    setShowDisclaimer(true)
  }

  async function handleDisclaimerConfirm() {
    setShowDisclaimer(false)
    setLoading(true)
    setNoCredits(false)
    const configToSend = pendingConfigRef.current ?? config
    pendingConfigRef.current = null
    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(sanitizeConfig(configToSend)),
      })
      if (res.status === 402) { setNoCredits(true); return }
      if (res.status === 422) {
        const err = await res.json().catch(() => null)
        console.error('[Analysis] 422 validation', JSON.stringify(err, null, 2))
        const first = err?.detail?.[0]
        const msg = first
          ? `Erro: ${(first.loc || []).join('.')} - ${first.msg}`
          : 'Dados invalidos: verifique area e pontos no mapa'
        showToast(msg, 'amber')
        return
      }
      if (!res.ok) throw new Error('Backend error')
      const data = await res.json()
      // Se o bbox foi ajustado, atualiza config local e mostra aviso persistente
      if (data.bbox_adjusted && data.final_bbox) {
        setConfig(c => ({ ...c, bbox: data.final_bbox }))
        setBboxWarning(data.bbox_warning || 'Área de análise ajustada automaticamente com base nos dados fornecidos.')
      }
      // Limpa pontos após análise concluída (próxima análise começa sem targets)
      setConfig(c => ({ ...c, targets: [] }))
      navigate(`/results?job_id=${data.job_id}`)
    } catch {
      navigate('/results?demo=true')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Modal de aviso metodológico */}
      {showDisclaimer && (
        <DisclaimerModal
          onConfirm={handleDisclaimerConfirm}
          onCancel={() => setShowDisclaimer(false)}
        />
      )}

      {/* Sidebar de configuração */}
      <aside className="w-80 flex-shrink-0 bg-slate-800/70 border-r border-slate-700 overflow-y-auto">
        <TargetConfig
          config={config}
          onChange={setConfig}
          onRun={handleRunAnalysis}
          loading={loading}
          token={token}
          mapMode={mapMode}
          setMapMode={setMapMode}
        />
      </aside>

      {/* Mapa principal */}
      <div className="flex-1 relative">

        {/* Botoes de acao grandes (canto superior direito do mapa) */}
        <div className="absolute top-4 right-4 flex flex-col gap-2" style={{ zIndex: 1100 }}>
          <button
            type="button"
            onClick={() => setMapMode(mapMode === 'add-target' ? 'view' : 'add-target')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold shadow-xl border transition-all ${
              mapMode === 'add-target'
                ? 'bg-amber-500 text-slate-900 border-amber-400 ring-4 ring-amber-500/30'
                : 'bg-slate-900/95 text-amber-400 border-amber-500/60 hover:bg-amber-500/20 backdrop-blur'
            }`}
          >
            <MapPinIcon className="w-5 h-5" />
            {mapMode === 'add-target' ? 'Cancelar (Esc)' : 'Adicionar Ponto'}
          </button>
          <button
            type="button"
            onClick={() => setMapMode(mapMode === 'draw-bbox' ? 'view' : 'draw-bbox')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold shadow-xl border transition-all ${
              mapMode === 'draw-bbox'
                ? 'bg-cyan-500 text-slate-900 border-cyan-400 ring-4 ring-cyan-500/30'
                : 'bg-slate-900/95 text-cyan-400 border-cyan-500/60 hover:bg-cyan-500/20 backdrop-blur'
            }`}
          >
            <Square2StackIcon className="w-5 h-5" />
            {mapMode === 'draw-bbox' ? 'Cancelar (Esc)' : 'Desenhar Area'}
          </button>
        </div>

        {/* Toolbar antigo (centro - oculto em telas pequenas) */}
        <div className="hidden md:flex absolute top-3 left-1/2 -translate-x-1/2 gap-1 bg-slate-900/95 border border-slate-700 rounded-lg p-1 backdrop-blur shadow-lg" style={{ zIndex: 1100 }}>
          {[
            { id: 'view', icon: CursorArrowRaysIcon, label: 'Mover' },
            { id: 'draw-bbox', icon: Square2StackIcon, label: 'Desenhar Area' },
            { id: 'add-target', icon: MapPinIcon, label: 'Adicionar Ponto' },
          ].map(({ id, icon: Icon, label }) => {
            const isActive = mapMode === id
            const isHighlight = mapMode === 'view' && id === 'add-target' && config.targets.length === 0
            return (
              <button
                key={id}
                onClick={() => setMapMode(id)}
                title={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? id === 'draw-bbox'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : id === 'add-target'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-700 text-white border border-slate-600'
                    : isHighlight
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/40 animate-pulse'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            )
          })}
        </div>

        {/* Aviso de ajuste automático de área */}
        {bboxWarning && (
          <div
            className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] flex items-start gap-2 bg-amber-950/95 border border-amber-500/50 text-amber-300 text-xs px-4 py-2.5 rounded-xl backdrop-blur shadow-lg max-w-sm w-[calc(100%-2rem)]"
            style={{ zIndex: 1200 }}
          >
            <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="flex-1 leading-relaxed">{bboxWarning}</span>
            <button onClick={() => setBboxWarning(null)} className="text-amber-500 hover:text-amber-300 flex-shrink-0 ml-1">✕</button>
          </div>
        )}

        {/* Toast de confirmacao */}
        {toast && (
          <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-xs font-medium backdrop-blur shadow-lg border transition-all ${
            toast.color === 'cyan'
              ? 'bg-cyan-900/95 border-cyan-500/50 text-cyan-300'
              : 'bg-amber-900/95 border-amber-500/50 text-amber-300'
          }`} style={{ zIndex: 1100 }}>
            {toast.msg}
          </div>
        )}

        {/* Instrucao contextual */}
        {mapMode === 'draw-bbox' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-cyan-900/90 border border-cyan-500/40 text-cyan-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur" style={{ zIndex: 1100 }}>
            Clique e arraste para desenhar a area
          </div>
        )}
        {mapMode === 'add-target' && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-amber-900/90 border border-amber-500/40 text-amber-300 text-xs px-3 py-1.5 rounded-lg backdrop-blur" style={{ zIndex: 1100 }}>
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
            {bboxDefined ? (
              <span className="text-white font-mono">
                {config.bbox.lonMin.toFixed(2)}° – {config.bbox.lonMax.toFixed(2)}°W /{' '}
                {config.bbox.latMin.toFixed(2)}° – {config.bbox.latMax.toFixed(2)}°S
              </span>
            ) : (
              <span className="text-slate-300">não definida</span>
            )}
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
