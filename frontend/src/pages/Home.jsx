import {
    ArrowRightIcon,
    ChartBarIcon,
    CpuChipIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    MapPinIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'

const FEATURES = [
  {
    icon: CpuChipIcon,
    title: 'PSI Index',
    desc: 'Índice de favorabilidade mineral por análise multivariada de dados geofísicos e radiométricos.',
    color: 'amber',
  },
  {
    icon: GlobeAltIcon,
    title: 'Mapeamento Geoespacial',
    desc: 'Visualização interativa via Mapbox GL com suporte a GeoTIFF, PostGIS e GeoServer.',
    color: 'blue',
  },
  {
    icon: ChartBarIcon,
    title: 'Ternário K-U-Th',
    desc: 'Classificação radiométrica para identificação de assinaturas de alteração hidrotermal.',
    color: 'emerald',
  },
  {
    icon: MapPinIcon,
    title: 'Ranking de Alvos',
    desc: 'Priorização automática de subalvos com PSI Index e clustering espacial DBSCAN.',
    color: 'rose',
  },
  {
    icon: DocumentTextIcon,
    title: 'Relatório em PDF',
    desc: 'Geração automática de relatório técnico com mapas, tabelas e recomendações por alvo.',
    color: 'purple',
  },
  {
    icon: SparklesIcon,
    title: 'Dados Reais ou Sintéticos',
    desc: 'Pipeline flexível: demonstração sintética ou dados reais via GDAL/GeoTIFF/CSV.',
    color: 'sky',
  },
]

const COLORS = {
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  blue: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  rose: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
  purple: 'border-purple-500/20 bg-purple-500/10 text-purple-400',
  sky: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
}

const STATS = [
  { value: 'PSI', label: 'Índice de Favorabilidade' },
  { value: 'Top 5%', label: 'Zonas Prioritárias' },
  { value: 'DBSCAN', label: 'Clustering Espacial' },
  { value: 'GDAL', label: 'Suporte Geoespacial' },
]

const STEPS = [
  { n: 1, title: 'Configuração da Área', desc: 'Defina o bounding box, alvos e commodity de interesse.' },
  { n: 2, title: 'Carregamento de Dados', desc: 'Geofísica (MAG, GRAV) e radiometria (K, U, Th) via GeoTIFF ou CSV.' },
  { n: 3, title: 'Normalização Robusta', desc: 'RobustScaler aplicado por camada, resistente a outliers.' },
  { n: 4, title: 'Cálculo do PSI Index', desc: 'Combinação ponderada das camadas normalizadas.' },
  { n: 5, title: 'Identificação de Zonas', desc: 'DBSCAN sobre o top 5% do PSI Index.' },
  { n: 6, title: 'Ranking de Subalvos', desc: 'Priorização com métricas integradas por alvo.' },
  { n: 7, title: 'Relatório Técnico', desc: 'Exportação automática: mapas (PNG) + relatório (PDF).' },
]

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-24 px-4">
        {/* Background grid texture */}
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm px-4 py-1.5 rounded-full mb-6">
            <SparklesIcon className="w-4 h-4" />
            Pipeline de Prospecção Mineral — Fase Exploratória Inicial
          </div>

          <h1 className="text-5xl sm:text-6xl font-extrabold mb-6 leading-tight tracking-tight">
            Análise de{' '}
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
              Favorabilidade
            </span>{' '}
            Mineral
          </h1>

          <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto leading-relaxed">
            Plataforma integrada de análise geoespacial para prospecção mineral. Identifique
            zonas prioritárias e gere rankings de alvos a partir de dados geofísicos e
            radiométricos — com metodologia PSI Analytics.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              to="/analysis"
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-colors shadow-lg shadow-amber-500/20"
            >
              Iniciar Análise
              <ArrowRightIcon className="w-4 h-4" />
            </Link>
            <Link
              to="/results"
              className="flex items-center gap-2 border border-slate-600 hover:border-slate-500 hover:bg-slate-800 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Ver Demo de Resultados
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-slate-800/40 border-y border-slate-700/60">
        <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
          {STATS.map(({ value, label }) => (
            <div key={label}>
              <div className="text-xl font-bold text-amber-400 mb-0.5">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="max-w-7xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Metodologia PSI Analytics</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Pipeline completo de análise integrada de favorabilidade exploratória mineral,
            integrando dados geofísicos e radiométricos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div
              key={title}
              className="border border-slate-700/60 rounded-xl p-6 bg-slate-800/40 hover:bg-slate-800/70 transition-colors group"
            >
              <div className={`inline-flex p-2.5 rounded-lg border mb-4 ${COLORS[color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">{title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pipeline steps */}
      <section className="bg-slate-800/20 border-y border-slate-700/60 py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Pipeline de Análise</h2>
          <ol className="relative border-l border-slate-700 space-y-8 ml-4">
            {STEPS.map(({ n, title, desc }) => (
              <li key={n} className="ml-8">
                <span className="absolute -left-3.5 flex items-center justify-center w-7 h-7 bg-amber-500/15 text-amber-400 text-xs font-bold rounded-full border border-amber-500/30 ring-4 ring-slate-900">
                  {n}
                </span>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="text-sm text-slate-400 mt-0.5">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="max-w-3xl mx-auto px-4 py-10 text-center">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-6 text-sm text-amber-200/70">
          <strong className="text-amber-400">⚠ Importante:</strong> Esta plataforma usa dados{' '}
          <strong>sintéticos</strong> para fins de demonstração metodológica. Em uso real,
          substitua pela carga de dados geofísicos reais (GeoTIFF ou CSV). O PSI Index é um
          indicador relativo de favorabilidade — não é teor, reserva ou laudo geológico.
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Pronto para começar?</h2>
        <p className="text-slate-400 mb-8">
          Configure sua área de interesse e execute o pipeline de análise mineral completo.
        </p>
        <Link
          to="/analysis"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold px-8 py-4 rounded-lg transition-colors text-lg shadow-lg shadow-amber-500/20"
        >
          Iniciar Análise Agora
          <ArrowRightIcon className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/60 py-10 px-4 bg-slate-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-start justify-between gap-8 mb-6">
            {/* Marca */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🪨</span>
                <span className="text-white font-bold text-lg">
                  Geo<span className="text-amber-400">Analytics</span>
                </span>
              </div>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                Plataforma de análise integrada de favorabilidade exploratória mineral, desenvolvida pela PSI Analytics.
              </p>
            </div>

            {/* Contato PSI Analytics */}
            <div className="text-sm text-slate-400">
              <p className="text-white font-semibold mb-1">PSI Analytics</p>
              <p className="text-slate-500 text-xs mb-3">Análise Integrada de Favorabilidade Exploratória</p>
              <div className="space-y-1 text-xs">
                <p><span className="text-slate-600">CNPJ:</span> 64.951.708/0001-00</p>
                <p>
                  <span className="text-slate-600">Tel:</span>{' '}
                  <a href="tel:+558698875-0039" className="hover:text-amber-400 transition-colors">(86) 98875-0039</a>
                  {' / '}
                  <a href="tel:+5586998012001" className="hover:text-amber-400 transition-colors">(86) 99801-2001</a>
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
            <span>© {new Date().getFullYear()} PSI Analytics — Todos os direitos reservados.</span>
            <span className="text-slate-700">Os resultados são indicativos exploratórios — não constituem laudo geológico ou garantia de reserva mineral.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
