import { PlayIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import DataUpload from './DataUpload'

export default function TargetConfig({ config, onChange, onRun, loading, token }) {
  function updateBbox(key, val) {
    onChange({ ...config, bbox: { ...config.bbox, [key]: parseFloat(val) || 0 } })
  }

  function addTarget() {
    const newId = `T${config.targets.length + 1}`
    onChange({
      ...config,
      targets: [...config.targets, { id: newId, lon: -41.0, lat: -4.3 }],
    })
  }

  function removeTarget(id) {
    onChange({ ...config, targets: config.targets.filter((t) => t.id !== id) })
  }

  function updateTarget(id, key, val) {
    onChange({
      ...config,
      targets: config.targets.map((t) =>
        t.id === id ? { ...t, [key]: parseFloat(val) || 0 } : t
      ),
    })
  }

  return (
    <div className="p-4 space-y-5">
      {/* Title */}
      <div className="pb-2 border-b border-slate-700">
        <h2 className="text-base font-semibold text-white">Configuração</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Pipeline GeoProspecting — {config.commodity}
        </p>
      </div>

      {/* Commodity */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Commodity Alvo
        </label>
        <select
          value={config.commodity}
          onChange={(e) => onChange({ ...config, commodity: e.target.value })}
          className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
        >
          <option>OURO</option>
          <option>COBRE</option>
          <option>FERRO</option>
          <option>PRATA</option>
        </select>
      </div>

      {/* Bounding Box */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-2">
          Área de Interesse (Bounding Box)
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['lonMin', 'Lon Mín'],
            ['latMin', 'Lat Mín'],
            ['lonMax', 'Lon Máx'],
            ['latMax', 'Lat Máx'],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-slate-500 mb-0.5">{label}</label>
              <input
                type="number"
                step="0.01"
                value={config.bbox[key]}
                onChange={(e) => updateBbox(key, e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Resolution slider */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Resolução —{' '}
          <span className="text-amber-400 font-semibold">
            ~{(config.resolution * 111).toFixed(1)} km/pixel
          </span>
        </label>
        <input
          type="range"
          min="0.005"
          max="0.05"
          step="0.005"
          value={config.resolution}
          onChange={(e) => onChange({ ...config, resolution: parseFloat(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-0.5">
          <span>Alta (~0.5 km)</span>
          <span>Baixa (~5.5 km)</span>
        </div>
      </div>

      {/* Raio por alvo */}
      <div>
        <label className="block text-xs font-medium text-slate-400 mb-1.5">
          Raio de análise por alvo —{' '}
          <span className="text-amber-400 font-semibold">{config.radiusKm} km</span>
        </label>
        <input
          type="range"
          min="5"
          max="50"
          step="5"
          value={config.radiusKm}
          onChange={(e) => onChange({ ...config, radiusKm: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-0.5">
          <span>5 km</span>
          <span>50 km</span>
        </div>
      </div>

      {/* Targets list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-400">
            Pontos de Interesse ({config.targets.length})
          </label>
          <button
            onClick={addTarget}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Adicionar
          </button>
        </div>

        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
          {config.targets.map((t) => (
            <div key={t.id} className="bg-slate-700/40 rounded-lg p-2.5 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-400">{t.id}</span>
                <button
                  onClick={() => removeTarget(t.id)}
                  className="text-slate-600 hover:text-rose-400 transition-colors"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ['lon', 'Longitude'],
                  ['lat', 'Latitude'],
                ].map(([k, lbl]) => (
                  <div key={k}>
                    <label className="block text-xs text-slate-500 mb-0.5">{lbl}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={t[k]}
                      onChange={(e) => updateTarget(t.id, k, e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload de dados do cliente */}
      <div className="border-t border-slate-700 pt-4">
        <DataUpload config={config} token={token} />
      </div>

      {/* Run button */}
      <button
        onClick={onRun}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 font-bold py-3 rounded-lg transition-all shadow-lg shadow-amber-500/20"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />
            Analisando…
          </>
        ) : (
          <>
            <PlayIcon className="w-4 h-4" />
            Iniciar Análise
          </>
        )}
      </button>

      <p className="text-[10px] text-slate-600 text-center leading-relaxed">
        Sem upload: dados reais via CPRM/ICGEM ou sintético determinístico.
      </p>
    </div>
  )
}
