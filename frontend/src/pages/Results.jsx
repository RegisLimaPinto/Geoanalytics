import {
    ArrowDownTrayIcon,
    ArrowLeftIcon,
    CheckCircleIcon,
    MapPinIcon,
    TrophyIcon,
} from '@heroicons/react/24/outline'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KUThBars, LayerRadar, PSIBars } from '../components/Charts/GeoCharts'

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

  const handleExportPDF = async () => {
    if (!reportRef.current || exporting) return
    setExporting(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0f172a',
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgH = (canvas.height * pageW) / canvas.width
      let yPos = 0
      let remaining = imgH
      while (remaining > 0) {
        pdf.addImage(imgData, 'PNG', 0, -yPos, pageW, imgH)
        remaining -= pageH
        yPos += pageH
        if (remaining > 0) pdf.addPage()
      }
      const filename = `GeoAnalytics_${data.commodity}_${new Date().toISOString().slice(0, 10)}.pdf`
      pdf.save(filename)
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

    fetch(`/api/analysis/${jobId}/results`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => { setData(DEMO); setLoading(false) })
  }, [params])

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
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="flex items-center gap-1.5 text-sm border border-slate-600 hover:border-amber-500/50 hover:text-amber-400 disabled:opacity-50 text-slate-400 px-3 py-1.5 rounded-md transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
        </button>
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
            { n: 3, title: 'Dados Reais', desc: 'Substituir dados sintéticos por GeoTIFFs de levantamentos reais (MAG, GRAV, RAD).' },
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

      {/* Disclaimer */}
      <div className="text-xs text-slate-600 text-center pb-4 leading-relaxed">
        ⚠ Dados sintéticos para demonstração metodológica · PSI Index é indicador relativo —
        não é teor, reserva ou laudo geológico · Use como ferramenta de apoio à decisão
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
