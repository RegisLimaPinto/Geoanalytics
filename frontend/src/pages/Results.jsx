import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  BeakerIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  FlagIcon,
  MapPinIcon,
  TrophyIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KUThBars, LayerRadar, PSIBars } from '../components/Charts/GeoCharts'
import { useAuth } from '../context/AuthContext'
import GeoMap from '../components/Map/GeoMap'

const DEMO = {
  commodity: 'OURO',
  jobId: 'demo-synthetic',
  createdAt: new Date().toISOString(),
  bbox: { lonMin: -41.95, latMin: -4.75, lonMax: -40.30, latMax: -3.90 },
  radiusKm: 5,
  targets: [
    { id: 'Z1', lon: -40.57, lat: -4.65, psiScore: 0.873, priority: 1, cluster: 'A', area_km2: 42.3 },
    { id: 'Z2', lon: -41.58, lat: -4.30, psiScore: 0.718, priority: 2, cluster: 'B', area_km2: 31.1 },
    { id: 'Z3', lon: -41.20, lat: -4.52, psiScore: 0.612, priority: 3, cluster: 'C', area_km2: 18.7 },
  ],
  layers: [
    { name: 'K (Potassio)', anomaly: 0.78 }, { name: 'U (Uranio)', anomaly: 0.65 },
    { name: 'Th (Torio)', anomaly: 0.42 }, { name: 'MAG', anomaly: 0.83 }, { name: 'GRAV', anomaly: 0.59 },
  ],
  ternary: [
    { name: 'Z1', K: 65, U: 20, Th: 15 }, { name: 'Z2', K: 45, U: 35, Th: 20 },
    { name: 'Z3', K: 30, U: 40, Th: 30 }, { name: 'BG', K: 25, U: 25, Th: 50 },
  ],
  topZones: 12,
  dataType: 'Sintetico (deterministico)',
  layerSources: { MAG: 'sintetico', GRAV: 'sintetico', K: 'sintetico', U: 'sintetico', Th: 'sintetico', BOUGUER: 'sintetico' },
  zones: [
    { Target: 'Z1', Zone: 1, PriorityScore: 0.91, PeakScore: 0.95, MeanScore: 0.87, Area_km2: 42.3, CentroidLon: -40.57, CentroidLat: -4.65, DistanceToTarget_km: 0.5, Classe: 'Alta' },
    { Target: 'Z2', Zone: 1, PriorityScore: 0.73, PeakScore: 0.78, MeanScore: 0.68, Area_km2: 31.1, CentroidLon: -41.58, CentroidLat: -4.30, DistanceToTarget_km: 1.2, Classe: 'Media' },
    { Target: 'Z3', Zone: 1, PriorityScore: 0.58, PeakScore: 0.65, MeanScore: 0.52, Area_km2: 18.7, CentroidLon: -41.20, CentroidLat: -4.52, DistanceToTarget_km: 2.1, Classe: 'Baixa' },
  ],
  subtargets: [
    { Target: 'Z1', Rank: 1, Score: 0.95, Lon: -40.56, Lat: -4.64, DistanceToTarget_km: 1.1, Justificativa: 'Maximo local de alta favorabilidade - candidato primario' },
    { Target: 'Z1', Rank: 2, Score: 0.87, Lon: -40.59, Lat: -4.67, DistanceToTarget_km: 2.4, Justificativa: 'Maximo local moderado - candidato secundario' },
    { Target: 'Z2', Rank: 1, Score: 0.78, Lon: -41.56, Lat: -4.29, DistanceToTarget_km: 1.8, Justificativa: 'Maximo local moderado - candidato secundario' },
  ],
  targetStats: [
    { Target: 'Z1', Radius_km: 10, LocalMean: 0.81, P90: 0.92, Max: 0.95, Min: 0.42, Std: 0.14, Consistency: 0.83, DominanceRisk: 0.38 },
    { Target: 'Z2', Radius_km: 10, LocalMean: 0.66, P90: 0.77, Max: 0.78, Min: 0.31, Std: 0.16, Consistency: 0.74, DominanceRisk: 0.42 },
  ],
}

function classBadge(cls) {
  if (cls === 'Alta') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
  if (cls === 'Media') return 'bg-amber-500/15 text-amber-400 border-amber-500/30'
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

const TABS = ['Visao Geral', 'Mapa 2D', 'Mapa 3D', 'Zonas', 'Subalvos', 'Analise Radial']

export default function Results() {
  const [params] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [mapError, setMapError] = useState(false)
  const { token } = useAuth()

  const handleExportPDF = async () => {
    if (exporting) return
    setPdfError(null)
    // Demo sem job real
    if (!data?.jobId || data.jobId === 'demo-synthetic') {
      setPdfError('Execute uma análise real para gerar o relatório PDF.')
      return
    }
    setExporting(true)
    try {
      const res = await fetch(`/api/analysis/${data.jobId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 404) {
        setPdfError('Relatório não disponível — o servidor foi reiniciado após esta análise. Execute uma nova análise para gerar o PDF.')
        return
      }
      if (!res.ok) throw new Error(res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `GeoAnalytics_${data.commodity}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setPdfError('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    const jobId = params.get('job_id')
    const isDemo = params.get('demo') === 'true' || !jobId
    setLoadError(null)
    setMapError(false)
    setLoading(true)

    if (isDemo) {
      setTimeout(() => {
        setData(DEMO)
        setLoading(false)
      }, 400)
      return
    }

    if (!token) {
      setLoadError('Sessao expirada. Entre novamente para carregar os resultados.')
      setLoading(false)
      return
    }

    fetch(`/api/analysis/${jobId}/results`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) {
          const payload = await r.json().catch(() => null)
          const detail = payload?.detail
          const detailMsg = typeof detail === 'string'
            ? detail
            : (detail?.message || '')
          throw new Error(detailMsg || `Erro ao buscar resultados (${r.status})`)
        }
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch((e) => {
        setData(null)
        setLoadError(e?.message || 'Nao foi possivel carregar este job no momento.')
        setLoading(false)
      })
  }, [params, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-sm">Carregando resultados...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="bg-rose-950/50 border border-rose-500/40 rounded-xl p-5">
          <p className="text-sm font-semibold text-rose-300">Nao foi possivel carregar os resultados</p>
          <p className="text-xs text-slate-400 mt-1">{loadError || 'Erro inesperado ao buscar dados da analise.'}</p>
          <Link to="/analysis" className="inline-block mt-4 text-amber-400 hover:text-amber-300 text-sm underline">
            Voltar para Analise
          </Link>
        </div>
      </div>
    )
  }

  const topTarget = data.targets?.[0] ?? { id: '-', psiScore: 0, priority: 0, cluster: '-', area_km2: 0, lon: 0, lat: 0 }
  const jobId = data.jobId
  const isDemo = jobId === 'demo-synthetic'

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-4">

      {data._expired && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-400 text-xl leading-none mt-0.5">&#9888;</span>
          <div>
            <p className="text-amber-300 text-sm font-medium">Job nao encontrado no servidor</p>
            <p className="text-slate-400 text-xs mt-0.5">
              O job <span className="font-mono">{jobId}</span> foi perdido pelo reinicio do servidor.
              Os dados abaixo sao demonstrativos.{' '}
              <Link to="/analysis" className="text-amber-400 hover:underline">Execute uma nova analise.</Link>
            </p>
          </div>
        </div>
      )}

      {/* Banner misto real + sintético */}
      {!isDemo && !data._expired && data.layerSources && Object.values(data.layerSources).some(s => s === 'sintetico') && Object.values(data.layerSources).some(s => s !== 'sintetico') && (
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-sky-400 text-base leading-none mt-0.5">&#8505;</span>
          <div>
            <p className="text-sky-300 text-sm font-medium">Analise mista: real + sintetico</p>
            <p className="text-slate-400 text-xs mt-0.5">
              Algumas camadas foram obtidas de fontes reais (CPRM/ICGEM) e outras caíram para dados sintéticos por indisponibilidade das APIs.
              Veja o painel <span className="text-sky-300 font-medium">Origem por camada</span> para detalhes.
            </p>
          </div>
        </div>
      )}

      {/* Banner 100% sintético (analise real que caiu tudo no fallback) */}
      {!isDemo && !data._expired && data.dataType?.includes('Sintetico') && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-amber-400 text-base leading-none mt-0.5">&#9888;</span>
          <div>
            <p className="text-amber-300 text-sm font-medium">Dados sinteticos (fallback)</p>
            <p className="text-slate-400 text-xs mt-0.5">
              As APIs CPRM e ICGEM nao responderam. Os resultados usam dados sintéticos determinísticos.
              Considere reexecutar a análise ou fazer upload manual dos seus GeoTIFFs.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/analysis" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> Nova Analise
          </Link>
          <span className="text-slate-700">|</span>
          <h1 className="text-lg font-bold text-white">
            Resultados &mdash; <span className="text-amber-400">{data.commodity}</span>
          </h1>
          {(isDemo || data._expired) && (
            <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
              {data._expired ? 'Job Expirado' : 'Demo'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isDemo && !data._expired && ['zonas', 'subalvos', 'alvos'].map(ds => (
            <button key={ds} onClick={async () => {
              const res = await fetch(`/api/analysis/${jobId}/csv/${ds}`, { headers: { Authorization: `Bearer ${token}` } })
              if (!res.ok) return
              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${ds}_${data.commodity}_${data.createdAt?.slice(0, 10)}.csv`
              a.click()
              URL.revokeObjectURL(url)
            }} className="flex items-center gap-1 text-xs border border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 px-2 py-1.5 rounded-md transition-colors">
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />{ds}.csv
            </button>
          ))}
          <button onClick={handleExportPDF} disabled={exporting}
            className="flex items-center gap-1.5 text-sm border border-amber-500/40 hover:border-amber-500 hover:text-amber-400 disabled:opacity-50 disabled:cursor-wait text-amber-400/80 px-3 py-1.5 rounded-md transition-colors">
            {exporting
              ? <><div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />Gerando PDF...</>
              : <><ArrowDownTrayIcon className="w-4 h-4" />Exportar PDF</>}
          </button>
        </div>
      </div>

      {/* Erro PDF inline */}
      {pdfError && (
        <div className="flex items-start gap-2 bg-rose-950/60 border border-rose-500/30 rounded-lg px-4 py-2.5 text-xs text-rose-300">
          <span className="flex-shrink-0 mt-0.5">⚠</span>
          <span className="flex-1">{pdfError}</span>
          <button onClick={() => setPdfError(null)} className="text-rose-500 hover:text-rose-300 flex-shrink-0">✕</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Melhor PSI Score" value={topTarget.psiScore > 0 ? `${(topTarget.psiScore * 100).toFixed(1)}%` : '-'} sub={`Alvo ${topTarget.id}`} icon={TrophyIcon} accent="amber" />
        <KpiCard label="Zonas Prioritarias" value={data.zones?.length ?? data.topZones ?? 0} sub="detectadas no grid" icon={MapPinIcon} accent="blue" />
        <KpiCard label="Subalvos" value={data.subtargets?.length ?? 0} sub="maximos locais" icon={CheckCircleIcon} accent="emerald" />
        <KpiCard label="Fonte de Dados" value={data.dataType?.split(' ')[0] ?? '-'} sub={data.dataType} icon={null}
          accent={data.dataType?.includes('Sintetico') ? 'amber' : data.layerSources && Object.values(data.layerSources).some(s => s === 'sintetico') ? 'blue' : 'emerald'} />
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === i ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 0 - Visao Geral */}
      {activeTab === 0 && (
        <div className="space-y-5">
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Alvos &mdash; Ranking PSI</h2>
              {!data.targets?.length ? (
                <p className="text-slate-500 text-sm">Nenhum alvo disponivel.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      {['#', 'ID', 'PSI Score', 'Cluster', 'Area (km2)', 'Prioridade'].map(h => (
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
                          <div className="text-xs text-slate-500 font-mono">{t.lon?.toFixed(3)}&deg; {t.lat?.toFixed(3)}&deg;</div>
                        </td>
                        <td className="py-2.5 pr-3 w-36"><ScoreBar value={t.psiScore ?? 0} /></td>
                        <td className="py-2.5 pr-3">
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30">{t.cluster ?? '-'}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300 font-mono text-xs">{(t.area_km2 ?? 0).toFixed(1)}</td>
                        <td className="py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded ${i === 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/60 text-slate-400'}`}>
                            {i === 0 ? 'Alta' : i === 1 ? 'Media' : 'Baixa'}
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
              <p className="text-xs text-slate-600 mt-3 text-center">0 = desfavoravel &middot; 1 = maxima favorabilidade</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Anomalias por Camada Geofisica</h2>
              <p className="text-xs text-slate-500 mb-4">Intensidade normalizada &mdash; area {topTarget.id}</p>
              <LayerRadar layers={data.layers} />
              {data.layerSources && Object.keys(data.layerSources).length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700/60">
                  <p className="text-xs text-slate-500 mb-2 font-medium">Origem por camada</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(data.layerSources).filter(([k]) => k !== 'BOUGUER').map(([key, src]) => {
                      const isReal = src !== 'sintetico'
                      const badge = isReal
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      const label = src === 'sintetico' ? 'sint.' : src === 'upload' ? 'upload' : src
                      return (
                        <span key={key} className={`text-xs font-mono px-1.5 py-0.5 rounded border ${badge}`}>
                          {key}: {label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-white mb-1">Composicao Radiometrica K-U-Th</h2>
              <p className="text-xs text-slate-500 mb-4">Proporcoes relativas &mdash; indicador de alteracao hidrotermal</p>
              <KUThBars data={data.ternary} />
              <div className="flex gap-4 justify-center mt-2 text-xs">
                {[['bg-amber-400', 'K'], ['bg-blue-400', 'U'], ['bg-emerald-400', 'Th']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className={`w-2.5 h-2.5 rounded-sm ${c} inline-block`} />{l}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Interpretacao Geologica</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm text-slate-300 leading-relaxed">
              <div className="space-y-2">
                {topTarget.psiScore > 0 && (
                  <p>
                    <span className="text-amber-400 font-semibold">Alvo principal &mdash; {topTarget.id}:</span>{' '}
                    PSI Score de <span className="text-white font-mono">{(topTarget.psiScore * 100).toFixed(1)}%</span>{' '}
                    indica favorabilidade {topTarget.psiScore > 0.8 ? 'alta' : topTarget.psiScore > 0.6 ? 'moderada' : 'baixa'} para {data.commodity}.
                    {topTarget.area_km2 > 0 && (
                      <> Area <span className="font-mono text-white">{topTarget.area_km2.toFixed(1)} km&sup2;</span> no raio configurado.</>
                    )}
                  </p>
                )}
                <p className="text-slate-500 text-xs">
                  {data.zones?.length > 0 ? `${data.zones.length} zonas prioritarias detectadas.` : ''}
                  {data.subtargets?.length > 0 ? ` ${data.subtargets.length} subalvos identificados.` : ''}
                </p>
              </div>
              <div className="space-y-2">
                <p>
                  <span className="text-slate-400 font-medium">Assinatura radiometrica:</span>{' '}
                  {(() => {
                    const t = data.ternary?.find(x => x.name === topTarget.id)
                    if (!t) return 'Perfil radiometrico nao disponivel.'
                    const dom = t.K >= t.U && t.K >= t.Th ? 'K (Potassio)' : t.U >= t.Th ? 'U (Uranio)' : 'Th (Torio)'
                    return `Dominancia de ${dom} (${Math.max(t.K, t.U, t.Th)}%) - tipico de ${
                      dom.startsWith('K') ? 'alteracao potassica' : dom.startsWith('U') ? 'fluidos hidrotermais' : 'sedimentacao de baixo grau'
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

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <FlagIcon className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Proximos Passos Recomendados</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  n: 1,
                  Icon: MapPinIcon,
                  color: 'text-emerald-400',
                  bg: 'bg-emerald-500/10 border-emerald-500/30',
                  title: 'Validacao de Campo',
                  desc: `Mapeamento geologico nas zonas ${topTarget.id !== '-' ? topTarget.id : 'prioritarias'} e adjacentes.`,
                  tag: 'Campo',
                },
                {
                  n: 2,
                  Icon: BeakerIcon,
                  color: 'text-blue-400',
                  bg: 'bg-blue-500/10 border-blue-500/30',
                  title: 'Geoquimica',
                  desc: `Amostragem de solo/rocha nos ${data.subtargets?.length ?? 0} subalvos top-ranked para deteccao de anomalias.`,
                  tag: 'Lab',
                },
                {
                  n: 3,
                  Icon: CloudArrowUpIcon,
                  color: data.dataType?.toLowerCase().includes('sint') ? 'text-amber-400' : 'text-emerald-400',
                  bg: data.dataType?.toLowerCase().includes('sint') ? 'bg-amber-500/10 border-amber-500/30' : 'bg-emerald-500/10 border-emerald-500/30',
                  title: 'Dados Reais',
                  desc: data.dataType?.toLowerCase().includes('sint')
                    ? 'Substitua dados sinteticos por GeoTIFFs reais do CPRM/INPE.'
                    : `Dados ${data.dataType} ja aplicados nesta analise.`,
                  tag: data.dataType?.toLowerCase().includes('sint') ? 'Pendente' : 'Concluido',
                },
                {
                  n: 4,
                  Icon: WrenchScrewdriverIcon,
                  color: 'text-orange-400',
                  bg: 'bg-orange-500/10 border-orange-500/30',
                  title: 'Sondagem',
                  desc: `Planejar sondagem com base nas ${data.zones?.filter(z => z.Classe === 'Alta').length ?? 0} zonas de Alta prioridade confirmadas em campo.`,
                  tag: 'Fase 2',
                },
              ].map(({ n, Icon, color, bg, title, desc, tag }) => (
                <div key={n} className="flex flex-col gap-3 p-4 bg-slate-700/30 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className={`w-9 h-9 rounded-lg border ${bg} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border ${bg} ${color}`}>{tag}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-slate-600">0{n}</span>
                      <span className="text-sm font-semibold text-white">{title}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 flex flex-wrap gap-4 justify-between">
            <span><span className="text-slate-600">Job ID:</span> <span className="font-mono">{jobId}</span></span>
            <span><span className="text-slate-600">Data:</span> <span className="font-mono">{data.createdAt ? new Date(data.createdAt).toLocaleString('pt-BR') : '-'}</span></span>
            <span><span className="text-slate-600">Bbox:</span> <span className="font-mono">{data.bbox?.lonMin?.toFixed(2)}&deg; / {data.bbox?.latMin?.toFixed(2)}&deg; &rarr; {data.bbox?.lonMax?.toFixed(2)}&deg; / {data.bbox?.latMax?.toFixed(2)}&deg;</span></span>
          </div>
          <p className="text-xs text-slate-600 text-center pb-2">
            PSI Index e indicador relativo &mdash; nao e teor, reserva ou laudo geologico. Use como ferramenta de apoio a decisao.
          </p>
        </div>
      )}

      {/* Tab 1 - Mapa 2D */}
      {activeTab === 1 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-white">Mapa de Favorabilidade 2D</h2>
            <p className="text-xs text-slate-500 mt-0.5">Heatmap PSI com contornos top 5% / 10% / 20%</p>
          </div>
          {isDemo || data._expired ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-sm">Mapa 2D disponivel apenas para analises reais em execucao.</p>
              <Link to="/analysis" className="mt-3 inline-block text-amber-400 hover:text-amber-300 text-sm underline">
                Executar nova analise &rarr;
              </Link>
            </div>
          ) : mapError ? (
            <div className="p-12 text-center text-slate-500"><p>Mapa PNG nao disponivel para este job.</p></div>
          ) : (
            <img src={`/api/analysis/${jobId}/map/favorability`} alt="Mapa de favorabilidade"
              className="w-full" onError={() => setMapError(true)} style={{ background: '#0f172a' }} />
          )}
        </div>
      )}

      {/* Tab 2 - Mapa 3D */}
      {activeTab === 2 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-white">Superficie 3D de Favorabilidade</h2>
            <p className="text-xs text-orange-400 mt-0.5">&#9888; Eixo Z = Score PSI &mdash; NAO representa profundidade geologica</p>
          </div>
          {isDemo || data._expired ? (
            <div className="p-12 text-center text-slate-500">
              <p className="text-sm">Mapa 3D disponivel apenas para analises reais em execucao.</p>
              <Link to="/analysis" className="mt-3 inline-block text-amber-400 hover:text-amber-300 text-sm underline">
                Executar nova analise &rarr;
              </Link>
            </div>
          ) : (
            <iframe src={`/api/analysis/${jobId}/map/3d`} title="Superficie 3D"
              style={{ width: '100%', height: '70vh', border: 'none', background: '#0f172a' }}
              sandbox="allow-scripts" />
          )}
        </div>
      )}

      {/* Tab 3 - Zonas */}
      {activeTab === 3 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Zonas Prioritarias Detectadas</h2>
              <p className="text-xs text-slate-500 mt-0.5">Regioes contíguas de alto score dentro do raio analisado</p>
            </div>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{data.zones?.length ?? 0} zonas</span>
          </div>
          {!data.zones?.length ? (
            <p className="text-slate-500 text-sm">Nenhuma zona detectada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Alvo', 'Zona', 'PriorityScore', 'PeakScore', 'MeanScore', 'Area (km2)', 'CentroidLon', 'CentroidLat', 'Dist. (km)', 'Classe'].map(h => (
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
                        <span className={`px-1.5 py-0.5 rounded border text-xs font-medium ${classBadge(z.Classe)}`}>{z.Classe ?? '-'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4 - Subalvos */}
      {activeTab === 4 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Subalvos Recomendados</h2>
              <p className="text-xs text-slate-500 mt-0.5">Maximos locais do PSI dentro do raio de analise &mdash; GeoPSI v4.0</p>
            </div>
            <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-full">{data.subtargets?.length ?? 0} subalvos</span>
          </div>
          {!data.subtargets?.length ? (
            <p className="text-slate-500 text-sm">Nenhum subalvo detectado.</p>
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
                            <div className={`h-full rounded-full ${s.Score > 0.8 ? 'bg-amber-400' : s.Score > 0.6 ? 'bg-orange-400' : 'bg-slate-500'}`}
                              style={{ width: `${(s.Score * 100).toFixed(0)}%` }} />
                          </div>
                          <span className="font-mono font-bold text-white">{(s.Score * 100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Lon ?? 0).toFixed(5)}&deg;</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.Lat ?? 0).toFixed(5)}&deg;</td>
                      <td className="py-2.5 pr-3 font-mono text-slate-400">{(s.DistanceToTarget_km ?? 0).toFixed(2)}</td>
                      <td className="py-2.5 text-slate-400 max-w-xs">{s.Justificativa ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 5 - Analise Radial */}
      {activeTab === 5 && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Analise Radial por Alvo</h2>
            <p className="text-xs text-slate-500 mt-0.5">Estatisticas do PSI Score dentro do raio de analise por alvo</p>
          </div>
          {!data.targetStats?.length ? (
            <p className="text-slate-500 text-sm">Analise radial nao disponivel.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    {['Alvo', 'Raio (km)', 'Media Local', 'P90', 'Max', 'Min', 'Std', 'Consistencia', 'Risco Dominancia'].map(h => (
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
                        <span className={`font-mono ${(s.DominanceRisk ?? 0) > 0.5 ? 'text-red-400' : 'text-slate-400'}`}>
                          {(s.DominanceRisk ?? 0).toFixed(3)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-600 mt-3">
                Consistencia: proximidade entre camadas &mdash; quanto maior, mais homogenea a assinatura.
                DominanceRisk: risco de uma unica camada dominar o score.
              </p>
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
