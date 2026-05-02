import {
    ArrowDownTrayIcon,
    ArrowLeftIcon,
    CheckCircleIcon,
    MapPinIcon,
    TrophyIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KUThBars, LayerRadar, PSIBars } from '../components/Charts/GeoCharts'
import { useAuth } from '../context/AuthContext'
import GeoMap from '../components/Map/GeoMap'

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO = {
  commodity: 'OURO',
  jobId: 'demo-synthetic',
  createdAt: new Date().toISOString(),
  bbox: { lonMin: -41.95, latMin: -4.75, lonMax: -40.30, latMax: -3.90 },
  radiusKm: 20,
  targets: [
    { id: 'Z1', lon: -40.57, lat: -4.65, psiScore: 0.873, priority: 1, cluster: 'A', area_km2: 42.3 },
    { id: 'Z2', lon: -41.58, lat: -4.30, psiScore: 0.718, priority: 2, cluster: 'B', area_km2: 31.1 },
    { id: 'Z3', lon: -41.20, lat: -4.52, psiScore: 0.612, priority: 3, cluster: 'C', area_km2: 18.7 },
  ],
  layers: [
    { name: 'K (Potássio)', anomaly: 0.78 }, { name: 'U (Urânio)', anomaly: 0.65 },
    { name: 'Th (Tório)', anomaly: 0.42 }, { name: 'MAG', anomaly: 0.83 }, { name: 'GRAV', anomaly: 0.59 },
  ],
  ternary: [
    { name: 'Z1', K: 65, U: 20, Th: 15 }, { name: 'Z2', K: 45, U: 35, Th: 20 },
    { name: 'Z3', K: 30, U: 40, Th: 30 }, { name: 'BG', K: 25, U: 25, Th: 50 },
  ],
  topZones: 12,
  dataType: 'Sintético',
  zones: [
    { Target: 'Z1', Zone: 1, PriorityScore: 0.91, PeakScore: 0.95, MeanScore: 0.87, Area_km2: 42.3, CentroidLon: -40.57, CentroidLat: -4.65, DistanceToTarget_km: 0.5, Threshold: 0.85, Classe: 'Alta' },
    { Target: 'Z2', Zone: 1, PriorityScore: 0.73, PeakScore: 0.78, MeanScore: 0.68, Area_km2: 31.1, CentroidLon: -41.58, CentroidLat: -4.30, DistanceToTarget_km: 1.2, Threshold: 0.68, Classe: 'Média' },
    { Target: 'Z3', Zone: 1, PriorityScore: 0.58, PeakScore: 0.65, MeanScore: 0.52, Area_km2: 18.7, CentroidLon: -41.20, CentroidLat: -4.52, DistanceToTarget_km: 2.1, Threshold: 0.55, Classe: 'Baixa' },
  ],
  subtargets: [
    { Target: 'Z1', Rank: 1, Score: 0.95, Lon: -40.56, Lat: -4.64, DistanceToTarget_km: 1.1, Justificativa: 'Máximo local de alta favorabilidade — candidato primário' },
    { Target: 'Z1', Rank: 2, Score: 0.87, Lon: -40.59, Lat: -4.67, DistanceToTarget_km: 2.4, Justificativa: 'Máximo local moderado — candidato secundário' },
    { Target: 'Z2', Rank: 1, Score: 0.78, Lon: -41.56, Lat: -4.29, DistanceToTarget_km: 1.8, Justificativa: 'Máximo local moderado — candidato secundário' },
  ],
  targetStats: [
    { Target: 'Z1', Radius_km: 10, LocalMean: 0.81, P90: 0.92, Max: 0.95, Min: 0.42, Std: 0.14, Consistency: 0.83, DominanceRisk: 0.38 },
    { Target: 'Z2', Radius_km: 10, LocalMean: 0.66, P90: 0.77, Max: 0.78, Min: 0.31, Std: 0.16, Consistency: 0.74, DominanceRisk: 0.42 },
  ],
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function classBadge(cls) {
  if (cls === 'Alta') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (cls === 'Média') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  return 'bg-slate-700 text-slate-400 border-slate-600'
}

function ScoreBar({ value }) {
  const pct = Math.round((value ?? 0) * 100)
  const color = value > 0.8 ? 'bg-amber-400' : value > 0.6 ? 'bg-orange-400' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-white w-10 text-right">
        {(value ?? 0).toFixed(3)}
      </span>
    </div>
  )
}

const TABS = ['Visão Geral', 'Mapa 2D', 'Mapa 3D', 'Zonas', 'Subalvos', 'Análise Radial']

export default function Results() {
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [mapError, setMapError] = useState(false)
  const { token } = useAuth()

  const handleExportPDF = async () => {
    if (!data?.jobId || data.jobId === 'demo-synthetic' || exporting) return
    setExporting(true)
    try {
      const res = await fetch(`/api/analysis/${data.jobId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GeoAnalytics_${data.commodity}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF não disponível. Execute uma análise real para gerar o relatório.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const jobId = params.get('job_id')
    const isDemo = params.get('demo') === 'true' || !jobId
    if (isDemo) { setTimeout(() => { setData(DEMO); setLoading(false) }, 600); return }
    fetch(`/api/analysis/${jobId}/results`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setData(DEMO); setLoading(false) })
  }, [params, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Carregando resultados…</p>
        </div>
      </div>
    )
  }

  const topTarget = data.targets?.[0] ?? { id: '—', psiScore: 0, priority: 0, cluster: '—', area_km2: 0, lon: 0, lat: 0 }
  const jobId = data.jobId
  const isDemo = jobId === 'demo-synthetic'

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/analysis" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> Nova Análise
          </Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-lg font-bold text-white">
            Resultados — <span className="text-amber-400">{data.commodity}</span>
          </h1>
          {isDemo && (
            <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              Dados Sintéticos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isDemo && ['zonas', 'subalvos', 'alvos'].map(ds => (
            <button key={ds} onClick={async () => {
              const res = await fetch(`/api/analysis/${jobId}/csv/${ds}`, { headers: { Authorization: `Bearer ${token}` } })
              if (!res.ok) return
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url
              a.download = `${ds}_${data.commodity}_${data.createdAt?.slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
            }} className="flex items-center gap-1 text-xs border border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-md transition-colors">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />{ds}.csv
            </button>
          ))}
          <button onClick={handleExportPDF} disabled={exporting}
            className="flex items-center gap-1.5 text-sm border border-slate-600 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-50 text-slate-400 px-3 py-1.5 rounded-md transition-colors">
            <ArrowDownTrayIcon className="w-4 h-4" />
            {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Melhor PSI Score" value={topTarget.psiScore > 0 ? `${(topTarget.psiScore * 100).toFixed(1)}%` : '—'} sub={`Alvo ${topTarget.id}`} icon={TrophyIcon} accent="amber" />
        <KpiCard label="Zonas Prioritárias" value={data.zones?.length ?? data.topZones ?? 0} sub="detectadas no grid" icon={MapPinIcon} accent="blue" />
        <KpiCard label="Subalvos" value={data.subtargets?.length ?? 0} sub="máximos locais detectados" icon={CheckCircleIcon} accent="emerald" />
        <KpiCard label="Fonte de Dados" value={data.dataType?.split(' ')[0] ?? '—'} sub={data.dataType} icon={null} accent="slate" />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === i
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 0: Visão Geral ── */}
      {activeTab === 0 && (
        <div className="space-y-5">
          {/* Mapa leaflet */}
          {data.bbox && data.targets && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Mapa de Zonas Analisadas</h2>
                <span className="text-xs text-slate-500">Raio por alvo: <span className="text-amber-400 font-mono">{data.radiusKm ?? 20} km</span></span>
              </div>
              <div style={{ height: 320 }}>
                <GeoMap bbox={data.bbox} targets={data.targets} radiusKm={data.radiusKm ?? 20} />
              </div>
            </div>
          )}

          {/* Ranking alvos */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Alvos — Ranking PSI</h2>
              {data.targets.length === 0 ? (
                <p className="text-slate-500 text-sm">Nenhum alvo disponível.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {['#', 'ID', 'PSI Score', 'Cluster', 'Área (km²)', 'Prioridade'].map(h => (
                        <th key={h} className="text-left text-xs font-medium text-slate-500 pb-2 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {data.targets.map((t, i) => (
                      <tr key={t.id} className="hover:bg-slate-700/20">
                        <td className="py-2.5 pr-3 text-slate-500 font-mono text-xs">{i + 1}</td>
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-amber-400">{t.id}</span>
                          <div className="text-xs text-slate-500 font-mono">{t.lon?.toFixed(3)}° {t.lat?.toFixed(3)}°</div>
                        </td>
                        <td className="py-2.5 pr-3 w-36"><ScoreBar value={t.psiScore ?? 0} /></td>
                        <td className="py-2.5 pr-3">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">{t.cluster ?? '—'}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300 font-mono text-xs">{(t.area_km2 ?? 0).toFixed(1)}</td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded ${i === 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/60 text-slate-400'}`}>
                            {i === 0 ? 'Alta' : i === 1 ? 'Média' : 'Baixa'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">PSI Index por Alvo</h2>
              <PSIBars targets={data.targets} />
              <p className="text-xs text-slate-600 mt-3 text-center">0 = desfavorável · 1 = máxima favorabilidade</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Anomalias por Camada Geofísica</h2>
              <p className="text-xs text-slate-500 mb-4">Intensidade normalizada — área {topTarget.id}</p>
              <LayerRadar layers={data.layers} />
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Composição Radiométrica K-U-Th</h2>
              <p className="text-xs text-slate-500 mb-4">Proporções relativas — indicador de alteração hidrotermal</p>
              <KUThBars data={data.ternary} />
              <div className="flex gap-4 justify-center mt-2 text-xs">
                {[['bg-amber-400','K'], ['bg-blue-400','U'], ['bg-emerald-400','Th']].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${c} inline-block`}/>{l}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Interpretação geológica */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Interpretação Geológica</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-slate-300 leading-relaxed">
              <div className="space-y-2">
                {topTarget.psiScore > 0 && (
                  <p>
                    <span className="text-amber-400 font-semibold">Alvo principal — {topTarget.id}:</span>{' '}
                    PSI Score de <span className="text-white font-mono">{(topTarget.psiScore * 100).toFixed(1)}%</span>{' '}
                    indica favorabilidade {topTarget.psiScore > 0.8 ? 'alta' : topTarget.psiScore > 0.6 ? 'moderada' : 'baixa'} para {data.commodity}.
                    {topTarget.area_km2 > 0 && <> Área <span className="font-mono text-white">{topTarget.area_km2.toFixed(1)} km²</span> no raio configurado.</>}
                  </p>
                )}
                <p className="text-slate-500 text-xs">
                  {data.zones?.length > 0 ? `${data.zones.length} zonas prioritárias detectadas no grid de favorabilidade.` : ''}
                  {data.subtargets?.length > 0 ? ` ${data.subtargets.length} subalvos identificados como máximos locais.` : ''}
                </p>
              </div>
              <div className="space-y-2">
                <p>
                  <span className="text-slate-400 font-medium">Assinatura radiométrica:</span>{' '}
                  {(() => {
                    const t = data.ternary?.find(x => x.name === topTarget.id)
                    if (!t) return 'Perfil radiométrico não disponível.'
                    const dom = t.K >= t.U && t.K >= t.Th ? 'K (Potássio)' : t.U >= t.Th ? 'U (Urânio)' : 'Th (Tório)'
                    return `Dominância de ${dom} (${Math.max(t.K, t.U, t.Th)}%) — típico de ${
                      dom.startsWith('K') ? 'alteração potássica' : dom.startsWith('U') ? 'fluidos hidrotermais' : 'sedimentação de baixo grau'
                    }.`
                  })()}
                </p>
                <div>
                  <span className="text-slate-400 text-xs">Fonte: </span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-mono ${
                    data.dataType?.includes('CPRM') ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'
                  }`}>{data.dataType}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Próximos passos */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Próximos Passos Recomendados</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { n: 1, title: 'Validação de Campo', desc: `Mapeamento geológico nas zonas ${topTarget.id !== '—' ? topTarget.id : ''} e adjacentes.` },
                { n: 2, title: 'Geoquímica', desc: 'Amostragem de solo/rocha nos subalvos top-ranked para detecção de anomalias.' },
                { n: 3, title: 'Dados Reais', desc: data.dataType?.includes('Sintético') ? 'Substitua dados sintéticos por GeoTIFFs reais no painel de upload.' : `Dados ${data.dataType} aplicados.` },
                { n: 4, title: 'Sondagem', desc: 'Planejar sondagem com base nas zonas prioritárias confirmadas em campo.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex gap-3 p-3 bg-slate-700/30 rounded-lg border border-slate-700">
                  <span className="flex-shrink-0 w-6 h-6 bg-amber-500/15 text-amber-400 text-xs font-bold rounded-full border border-amber-500/30 flex items-center justify-center mt-0.5">{n}</span>
                  <div>
                    <div className="text-sm font-medium text-white mb-0.5">{title}</div>
                    <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 flex flex-wrap gap-4 justify-between">
            <span><span className="text-slate-600">Job ID:</span> <span className="font-mono">{jobId}</span></span>
            <span><span className="text-slate-600">Data:</span> <span className="font-mono">{data.createdAt ? new Date(data.createdAt).toLocaleString('pt-BR') : '—'}</span></span>
            <span><span className="text-slate-600">Bbox:</span> <span className="font-mono">{data.bbox?.lonMin?.toFixed(2)}° / {data.bbox?.latMin?.toFixed(2)}° → {data.bbox?.lonMax?.toFixed(2)}° / {data.bbox?.latMax?.toFixed(2)}°</span></span>
          </div>
          <p className="text-xs text-slate-600 text-center pb-2">⚠ PSI Index é indicador relativo — não é teor, reserva ou laudo geológico · Use como ferramenta de apoio à decisão</p>
        </div>
      )}

      {/* ── Tab 1: Mapa 2D ── */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-white">Mapa de Favorabilidade 2D</h2>
              <p className="text-xs text-slate-500 mt-0.5">Contornos: Top 5% <span className="text-red-400">■</span> · Top 10% <span className="text-orange-400">■</span> · Top 20% <span className="text-yellow-400">■</span> · <span className="text-blue-400">◆</span> Centroides · <span className="text-purple-400">▲</span> Subalvos · <span className="text-amber-400">★</span> Alvos</p>
            </div>
            {isDemo ? (
              <div className="p-12 text-center text-slate-500">
                <p className="text-sm">Mapa 2D disponível apenas para análises reais.</p>
                <Link to="/analysis" className="mt-3 inline-block text-amber-400 hover:text-amber-300 text-sm underline">Executar análise real →</Link>
              </div>
            ) : (
              <div className="relative">
                {mapError ? (
                  <div className="p-12 text-center text-slate-500"><p>Mapa PNG não disponível para este job.</p></div>
                ) : (
                  <img
                    src={`/api/analysis/${jobId}/map/favorability`}
                    alt="Mapa de favorabilidade"
                    className="w-full"
                    onError={() => setMapError(true)}
                    style={{ background: '#0f172a' }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab 2: Mapa 3D ── */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-white">Superfície 3D de Favorabilidade</h2>
              <p className="text-xs text-orange-400 mt-0.5">⚠ Eixo Z = Score PSI — NÃO representa profundidade geológica</p>
            </div>
            {isDemo ? (
              <div className="p-12 text-center text-slate-500">
                <p className="text-sm">Mapa 3D disponível apenas para análises reais.</p>
                <Link to="/analysis" className="mt-3 inline-block text-amber-400 hover:text-amber-300 text-sm underline">Executar análise real →</Link>
              </div>
            ) : (
              <iframe
                src={`/api/analysis/${jobId}/map/3d`}
                title="Superfície 3D de Favorabilidade"
                style={{ width: '100%', height: '70vh', border: 'none', background: '#0f172a' }}
                sandbox="allow-scripts allow-same-origin"
              />
            )}
          </div>
        </div>
      )}

      {/* ── Tab 3: Zonas Prioritárias ── */}
      {activeTab === 3 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Zonas Prioritárias Detectadas</h2>
              <p className="text-xs text-slate-500 mt-0.5">Regiões contíguas de alto score dentro do raio analisado — detectadas via rotulagem morfológica</p>
            </div>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{data.zones?.length ?? 0} zonas</span>
          </div>
          {!data.zones?.length ? (
            <p className="text-slate-500 text-sm">Nenhuma zona detectada. Execute a análise com pelo menos um ponto de interesse.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Alvo', 'Zona', 'PriorityScore', 'PeakScore', 'MeanScore', 'Área (km²)', 'CentroidLon', 'CentroidLat', 'Dist. (km)', 'Classe'].map(h => (
                      <th key={h} className="text-left font-medium text-slate-500 pb-2 pr-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {data.zones.map((z, i) => (
                    <tr key={i} className="hover:bg-slate-700/20">
                      <td className="py-2 pr-3 font-semibold text-amber-400">{z.Target}</td>
                      <td className="py-2 pr-3 text-slate-400 font-mono">{z.Zone}</td>
                      <td className="py-2 pr-3 font-mono font-bold text-white">{(z.PriorityScore ?? 0).toFixed(4)}</td>
                      <td className="py-2 pr-3 font-mono text-amber-300">{(z.PeakScore ?? 0).toFixed(4)}</td>
                      <td className="py-2 pr-3 font-mono text-slate-300">{(z.MeanScore ?? 0).toFixed(4)}</td>
                      <td className="py-2 pr-3 font-mono text-slate-300">{(z.Area_km2 ?? 0).toFixed(2)}</td>
                      <td className="py-2 pr-3 font-mono text-slate-400">{(z.CentroidLon ?? 0).toFixed(5)}</td>
                      <td className="py-2 pr-3 font-mono text-slate-400">{(z.CentroidLat ?? 0).toFixed(5)}</td>
                      <td className="py-2 pr-3 font-mono text-slate-400">{(z.DistanceToTarget_km ?? 0).toFixed(2)}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${classBadge(z.Classe)}`}>{z.Classe ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 4: Subalvos ── */}
      {activeTab === 4 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Subalvos Recomendados</h2>
              <p className="text-xs text-slate-500 mt-0.5">Máximos locais do PSI dentro do raio de análise — GeoPSI v4.0</p>
            </div>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{data.subtargets?.length ?? 0} subalvos</span>
          </div>
          {!data.subtargets?.length ? (
            <p className="text-slate-500 text-sm">Nenhum subalvo detectado. Execute a análise com pelo menos um ponto de interesse.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Alvo', 'Rank', 'Score PSI', 'Longitude', 'Latitude', 'Dist. ao alvo (km)', 'Justificativa'].map(h => (
                      <th key={h} className="text-left font-medium text-slate-500 pb-2 pr-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {data.subtargets.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-700/20">
                      <td className="py-2.5 pr-3 font-semibold text-amber-400">{s.Target}</td>
                      <td className="py-2.5 pr-3 text-slate-300 font-mono">#{s.Rank}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${s.Score > 0.8 ? 'bg-amber-400' : s.Score > 0.6 ? 'bg-orange-400' : 'bg-slate-500'}`} style={{ width: `${(s.Score * 100).toFixed(0)}%` }} />
                          </div>
                          <span className="font-mono font-bold text-white">{(s.Score * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Lon ?? 0).toFixed(5)}°</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Lat ?? 0).toFixed(5)}°</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.DistanceToTarget_km ?? 0).toFixed(2)}</td>
                      <td className="py-2.5 text-slate-400 max-w-xs">{s.Justificativa ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab 5: Análise Radial ── */}
      {activeTab === 5 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Análise Radial por Alvo</h2>
            <p className="text-xs text-slate-500 mt-0.5">Estatísticas do PSI Score dentro do raio de análise por alvo</p>
          </div>
          {!data.targetStats?.length ? (
            <p className="text-slate-500 text-sm">Análise radial não disponível. Execute a análise com pelo menos um ponto de interesse.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Alvo', 'Raio (km)', 'Média Local', 'P90', 'Máx', 'Mín', 'Std', 'Consistência', 'Risco Dominância'].map(h => (
                      <th key={h} className="text-left font-medium text-slate-500 pb-2 pr-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/40">
                  {data.targetStats.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-700/20">
                      <td className="py-2.5 pr-3 font-semibold text-amber-400">{s.Target}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{s.Radius_km}</td>
                      <td className="py-2.5 pr-3 font-mono font-bold text-white">{(s.LocalMean ?? 0).toFixed(4)}</td>
                      <td className="py-2.5 pr-3 font-mono text-amber-300">{(s.P90 ?? 0).toFixed(4)}</td>
                      <td className="py-2.5 pr-3 font-mono text-emerald-400">{(s.Max ?? 0).toFixed(4)}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Min ?? 0).toFixed(4)}</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Std ?? 0).toFixed(4)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${((s.Consistency ?? 0) * 100).toFixed(0)}%` }} />
                          </div>
                          <span className="font-mono text-blue-400">{(s.Consistency ?? 0).toFixed(3)}</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className={`font-mono ${(s.DominanceRisk ?? 0) > 0.5 ? 'text-red-400' : 'text-slate-400'}`}>{(s.DominanceRisk ?? 0).toFixed(3)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-600 mt-3">Consistência: proximidade entre as camadas — quanto maior, mais homogênea a assinatura · DominanceRisk: risco de uma única camada dominar o score.</p>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  const accents = {
    amber: 'border-amber-500/20 bg-amber-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    slate: 'border-slate-700 bg-slate-800/30',
  }
  const textAccents = {
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    slate: 'text-white',
  }
  return (
    <div className={`rounded-xl border p-4 ${accents[accent]}`}>
      {Icon && <Icon className={`w-5 h-5 mb-2 ${textAccents[accent]}`} />}
      <div className={`text-2xl font-bold ${textAccents[accent]}`}>{value}</div>
      <div className="text-xs font-medium text-slate-300 mt-0.5">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  )
}


// ── Demo data (baseado no notebook GeoProspecting_Ouro_Pipeline) ──────────────
const DEMO = {
  commodity: 'OURO',
  jobId: 'demo-synthetic',
  createdAt: new Date().toISOString(),
  bbox: { lonMin: -41.95, latMin: -4.75, lonMax: -40.30, latMax: -3.90 },
  targets: [
    { id: 'T1', lon: -40.57, lat: -4.65, psiScore: 0.873, priority: 1, cluster: 'A', area_km2: 42.3 },
    { id: 'T2', lon: -41.58, lat: -4.30, psiScore: 0.718, priority: 2, cluster: 'B', area_km2: 31.1 },
    { id: 'T3', lon: -41.20, lat: -4.52, psiScore: 0.612, priority: 3, cluster: 'C', area_km2: 18.7 },
  ],
  layers: [
    { name: 'K (Potássio)', anomaly: 0.78 },
    { name: 'U (Urânio)', anomaly: 0.65 },
    { name: 'Th (Tório)', anomaly: 0.42 },
    { name: 'MAG', anomaly: 0.83 },
    { name: 'GRAV', anomaly: 0.59 },
  ],
  ternary: [
    { name: 'T1', K: 65, U: 20, Th: 15 },
    { name: 'T2', K: 45, U: 35, Th: 20 },
    { name: 'T3', K: 30, U: 40, Th: 30 },
    { name: 'BG', K: 25, U: 25, Th: 50 },
  ],
  topZones: 12,
  dataType: 'Sintético',
}

function priorityColor(p) {
  return p === 1 ? 'text-amber-400' : p === 2 ? 'text-slate-300' : 'text-amber-700'
}

function priorityBadge(p) {
  if (p === 1) return 'bg-amber-500/20 text-amber-400 border-amber-500/40'
  if (p === 2) return 'bg-slate-700 text-slate-300 border-slate-600'
  return 'bg-amber-900/20 text-amber-700 border-amber-800/40'
}

function ScoreBar({ value }) {
  const pct = Math.round(value * 100)
  const color = value > 0.8 ? 'bg-amber-400' : value > 0.6 ? 'bg-orange-400' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold text-white w-10 text-right">
        {value.toFixed(3)}
      </span>
    </div>
  )
}

export default function Results() {
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef(null)
  const { token } = useAuth()

  const handleExportPDF = async () => {
    if (!data?.jobId || data.jobId === 'demo-synthetic' || exporting) return
    setExporting(true)
    try {
      const res = await fetch(`/api/analysis/${data.jobId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GeoAnalytics_${data.commodity}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PDF não disponível para dados de demonstração. Execute uma análise real.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const jobId = params.get('job_id')
    const isDemo = params.get('demo') === 'true' || !jobId

    if (isDemo) {
      setTimeout(() => { setData(DEMO); setLoading(false) }, 600)
      return
    }

    fetch(`/api/analysis/${jobId}/results`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status)
        return r.json()
      })
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setData(DEMO); setLoading(false) })
  }, [params, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Processando análise…</p>
        </div>
      </div>
    )
  }

  const topTarget = data.targets[0]

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/analysis"
            className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Nova Análise
          </Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-lg font-bold text-white">
            Resultados — <span className="text-amber-400">{data.commodity}</span>
          </h1>
          {data.jobId === 'demo-synthetic' && (
            <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              Dados Sintéticos
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data.jobId !== 'demo-synthetic' && (
            <>
              {[
                { ds: 'zonas', label: 'zonas.csv' },
                { ds: 'subalvos', label: 'subalvos.csv' },
                { ds: 'alvos', label: 'alvos.csv' },
              ].map(({ ds, label }) => (
                <button
                  key={ds}
                  onClick={async () => {
                    const res = await fetch(`/api/analysis/${data.jobId}/csv/${ds}`, {
                      headers: { Authorization: `Bearer ${token}` },
                    })
                    if (!res.ok) return
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `${ds}_${data.commodity}_${data.createdAt?.slice(0,10)}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  className="flex items-center gap-1 text-xs border border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-md transition-colors"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </>
          )}
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-1.5 text-sm border border-slate-600 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-50 text-slate-400 px-3 py-1.5 rounded-md transition-colors"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
        </div>
      </div>

      {/* Conteúdo capturado para PDF */}
      <div ref={reportRef}>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Melhor PSI Score"
          value={topTarget.psiScore.toFixed(3)}
          sub={`Alvo ${topTarget.id}`}
          icon={TrophyIcon}
          accent="amber"
        />
        <KpiCard
          label="Zonas Prioritárias"
          value={data.topZones}
          sub="Top 5% do PSI Index"
          icon={MapPinIcon}
          accent="blue"
        />
        <KpiCard
          label="Alvos Analisados"
          value={data.targets.length}
          sub={data.targets.map((t) => t.id).join(' · ')}
          icon={CheckCircleIcon}
          accent="emerald"
        />
        <KpiCard
          label="Tipo de Dados"
          value={data.dataType}
          sub="Pipeline PSI Analytics"
          icon={null}
          accent="slate"
        />
      </div>

      {/* Mapa de resultados com raio real por alvo */}
      {data.bbox && data.targets && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Mapa de Favorabilidade — Zonas Analisadas</h2>
            <span className="text-xs text-slate-500">
              Raio de análise: <span className="text-amber-400 font-mono">{data.radiusKm ?? 20} km</span> por alvo
            </span>
          </div>
          <div style={{ height: 340 }}>
            <GeoMap bbox={data.bbox} targets={data.targets} radiusKm={data.radiusKm ?? 20} />
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Target ranking table */}
        <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Ranking de Subalvos Recomendados
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                {['#', 'Alvo', 'PSI Score', 'Cluster', 'Área (km²)', 'Status'].map((h) => (
                  <th key={h} className="text-left text-xs font-medium text-slate-500 pb-2 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.targets.map((t) => (
                <tr key={t.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className={`py-3 pr-4 font-bold text-base ${priorityColor(t.priority)}`}>
                    {t.priority === 1 ? '🥇' : t.priority === 2 ? '🥈' : '🥉'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-white">{t.id}</span>
                    <br />
                    <span className="text-xs text-slate-500 font-mono">
                      {t.lon.toFixed(2)}° {t.lat.toFixed(2)}°
                    </span>
                  </td>
                  <td className="py-3 pr-4 w-36">
                    <ScoreBar value={t.psiScore} />
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded border ${priorityBadge(t.priority)}`}
                    >
                      {t.cluster}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-300 font-mono text-xs">
                    {t.area_km2.toFixed(1)}
                  </td>
                  <td className="py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        t.priority === 1
                          ? 'bg-amber-500/15 text-amber-400'
                          : 'bg-slate-700/60 text-slate-400'
                      }`}
                    >
                      {t.priority === 1 ? 'Alta Prioridade' : t.priority === 2 ? 'Média' : 'Baixa'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PSI score bars */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">PSI Index por Alvo</h2>
          <PSIBars targets={data.targets} />
          <p className="text-xs text-slate-600 mt-3 text-center leading-relaxed">
            0 = desfavorável · 1 = máxima favorabilidade
          </p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Layer radar */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">
            Anomalias por Camada Geofísica
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Intensidade normalizada (RobustScaler) — área {topTarget.id}
          </p>
          <LayerRadar layers={data.layers} />
        </div>

        {/* K-U-Th ternary bars */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">
            Composição Radiométrica K-U-Th
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Proporções relativas por alvo — indicador de alteração hidrotermal
          </p>
          <KUThBars data={data.ternary} />
          <div className="flex gap-4 justify-center mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> K (Potássio)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400 inline-block" /> U (Urânio)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Th (Tório)</span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">
          Próximos Passos Recomendados
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: 1, title: 'Validação de Campo', desc: `Mapeamento geológico de superfície nas zonas ${topTarget.id} e adjacentes.` },
            { n: 2, title: 'Geoquímica', desc: 'Amostragem de solo/rocha nos subalvos top-ranked para detecção de anomalias.' },
            { n: 3, title: 'Dados Reais', desc: data.dataType?.includes('sintético') || data.dataType === 'Sintético' ? 'Substitua dados sintéticos por GeoTIFFs de levantamentos reais (MAG, GRAV, RAD) usando o painel de upload.' : `Dados ${data.dataType} já aplicados nesta análise.` },
            { n: 4, title: 'Sondagem', desc: 'Planejar linhas de sondagem com base nas zonas prioritárias confirmadas.' },
          ].map(({ n, title, desc }) => (
            <div key={n} className="flex gap-3 p-3 bg-slate-700/30 rounded-lg border border-slate-700">
              <span className="flex-shrink-0 w-6 h-6 bg-amber-500/15 text-amber-400 text-xs font-bold rounded-full border border-amber-500/30 flex items-center justify-center mt-0.5">
                {n}
              </span>
              <div>
                <div className="text-sm font-medium text-white mb-0.5">{title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Subalvos Recomendados (GeoPSI v4.0) */}
      {data.subtargets?.length > 0 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Subalvos Recomendados</h2>
          <p className="text-xs text-slate-500 mb-4">
            Máximos locais detectados no raio de análise — GeoPSI v4.0
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700">
                  {['Alvo', 'Rank', 'Score PSI', 'Longitude', 'Latitude', 'Dist. (km)'].map(h => (
                    <th key={h} className="text-left font-medium text-slate-500 pb-2 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {data.subtargets.slice(0, 15).map((s, i) => (
                  <tr key={i} className="hover:bg-slate-700/20">
                    <td className="py-2 pr-4 font-semibold text-amber-400">{s.Target}</td>
                    <td className="py-2 pr-4 text-slate-300 font-mono">#{s.Rank}</td>
                    <td className="py-2 pr-4">
                      <span className={`font-mono font-bold ${s.Score > 0.8 ? 'text-amber-400' : s.Score > 0.6 ? 'text-orange-400' : 'text-slate-400'}`}>
                        {(s.Score * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-400 font-mono">{s.Lon?.toFixed(4)}°</td>
                    <td className="py-2 pr-4 text-slate-400 font-mono">{s.Lat?.toFixed(4)}°</td>
                    <td className="py-2 text-slate-400 font-mono">{s.DistanceToTarget_km?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interpretação Geológica */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Interpretação Geológica</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-slate-300 leading-relaxed">
          <div className="space-y-2">
            <p>
              <span className="text-amber-400 font-semibold">Alvo principal — {topTarget.id}:</span>{' '}
              PSI Score de <span className="text-white font-mono">{(topTarget.psiScore * 100).toFixed(1)}%</span>{' '}
              indica favorabilidade {topTarget.psiScore > 0.8 ? 'alta' : topTarget.psiScore > 0.6 ? 'moderada' : 'baixa'} para {data.commodity}.
              Área analisada de <span className="text-white font-mono">{topTarget.area_km2?.toFixed(1)} km²</span> no raio configurado.
            </p>
            <p>
              Cluster <span className="text-amber-400 font-semibold">{topTarget.cluster}</span> — 
              alvos no mesmo cluster compartilham padrão geofísico similar e devem ser
              avaliados em conjunto durante validação de campo.
            </p>
          </div>
          <div className="space-y-2">
            <p>
              <span className="text-slate-400 font-medium">Assinatura radiométrica:</span>{' '}
              {(() => {
                const t = data.ternary?.find(x => x.name === topTarget.id)
                if (!t) return 'Perfil radiométrico não disponível.'
                const dom = t.K >= t.U && t.K >= t.Th ? 'K (Potássio)' : t.U >= t.Th ? 'U (Urânio)' : 'Th (Tório)'
                return `Dominância de ${dom} (${Math.max(t.K, t.U, t.Th)}%) — típico de ${
                  dom.startsWith('K') ? 'alteração potássica (granitos, pegmatitos)' :
                  dom.startsWith('U') ? 'fluidos hidrotermais urânio-ricos' :
                  'sedimentação de baixo grau'
                }.`
              })()}
            </p>
            <p>
              <span className="text-slate-400 font-medium">Fonte dos dados:</span>{' '}
              <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                data.dataType?.includes('Upload') || data.dataType?.includes('upload')
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : data.dataType?.includes('CPRM') || data.dataType?.includes('ICGEM')
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  : 'bg-slate-700 text-slate-400 border border-slate-600'
              }`}>
                {data.dataType}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Informações do relatório */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 flex flex-wrap gap-4 justify-between">
        <div>
          <span className="text-slate-600">Job ID:</span>{' '}
          <span className="font-mono text-slate-400">{data.jobId}</span>
        </div>
        <div>
          <span className="text-slate-600">Data/hora:</span>{' '}
          <span className="font-mono text-slate-400">
            {data.createdAt ? new Date(data.createdAt).toLocaleString('pt-BR') : '—'}
          </span>
        </div>
        <div>
          <span className="text-slate-600">Bbox:</span>{' '}
          <span className="font-mono text-slate-400">
            {data.bbox?.lonMin?.toFixed(2)}° / {data.bbox?.latMin?.toFixed(2)}° →{' '}
            {data.bbox?.lonMax?.toFixed(2)}° / {data.bbox?.latMax?.toFixed(2)}°
          </span>
        </div>
        <div>
          <span className="text-slate-600">Zonas top-5%:</span>{' '}
          <span className="font-mono text-slate-400">{data.topZones}</span>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-slate-600 text-center pb-4 leading-relaxed">
        ⚠ PSI Index é indicador relativo — não é teor, reserva ou laudo geológico · Use como ferramenta de apoio à decisão
      </div>
      </div>{/* fim ref={reportRef} */}
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, accent }) {
  const accents = {
    amber: 'border-amber-500/20 bg-amber-500/5',
    blue: 'border-blue-500/20 bg-blue-500/5',
    emerald: 'border-emerald-500/20 bg-emerald-500/5',
    slate: 'border-slate-700 bg-slate-800/30',
  }
  const textAccents = {
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    slate: 'text-white',
  }

  return (
    <div className={`rounded-xl border p-4 ${accents[accent]}`}>
      {Icon && <Icon className={`w-5 h-5 mb-2 ${textAccents[accent]}`} />}
      <div className={`text-2xl font-bold ${textAccents[accent]}`}>{value}</div>
      <div className="text-xs font-medium text-slate-300 mt-0.5">{label}</div>
      <div className="text-xs text-slate-500 mt-0.5 truncate">{sub}</div>
    </div>
  )
}
