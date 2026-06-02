import { PlayIcon, PlusIcon, TrashIcon, MapPinIcon, Square2StackIcon } from '@heroicons/react/24/outline'
import DataUpload from './DataUpload'

export default function TargetConfig({ config, onChange, onRun, loading, token, mapMode, setMapMode }) {
  function updateBbox(key, val) {
    onChange({ ...config, bbox: { ...config.bbox, [key]: parseFloat(val) || 0 } })
  }

  function addTarget() {
    if (config.targets.length >= 5) return
    if (setMapMode) {
      setMapMode('add-target')
      return
    }

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

      {/* Ferramentas do mapa - sempre visíveis no sidebar */}
      {setMapMode && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400">Ferramentas do mapa</p>
          <button
            type="button"
            onClick={() => setMapMode(mapMode === 'add-target' ? 'view' : 'add-target')}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold border transition-all ${
              mapMode === 'add-target'
                ? 'bg-amber-500 text-slate-900 border-amber-400 ring-2 ring-amber-500/40'
                : 'bg-slate-700/60 text-amber-400 border-amber-500/40 hover:bg-amber-500/10'
            }`}
          >
            <MapPinIcon className="w-4 h-4" />
            {mapMode === 'add-target' ? 'Cancelar (Esc)' : 'Adicionar Ponto no Mapa'}
          </button>
          <button
            type="button"
            onClick={() => setMapMode(mapMode === 'draw-bbox' ? 'view' : 'draw-bbox')}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold border transition-all ${
              mapMode === 'draw-bbox'
                ? 'bg-cyan-500 text-slate-900 border-cyan-400 ring-2 ring-cyan-500/40'
                : 'bg-slate-700/60 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/10'
            }`}
          >
            <Square2StackIcon className="w-4 h-4" />
            {mapMode === 'draw-bbox' ? 'Cancelar (Esc)' : 'Desenhar Área no Mapa'}
          </button>
        </div>
      )}

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
          <optgroup label="Metais Base">
            <option>OURO</option>
            <option>COBRE</option>
            <option>FERRO</option>
            <option>PRATA</option>
            <option>NIQUEL</option>
            <option>ZINCO</option>
            <option>CHUMBO</option>
            <option>MANGANES</option>
          </optgroup>
          <optgroup label="Terras Raras / Minerais Críticos">
            <option value="TERRAS_RARAS">TERRAS RARAS (REE)</option>
            <option value="REE">REE (alias)</option>
            <option value="NIOBIO">NIÓBIO</option>
            <option value="TITANIO">TITÂNIO</option>
            <option value="LITIO">LÍTIO</option>
            <option value="FOSFATO">FOSFATO</option>
          </optgroup>
        </select>
      </div>

      {/* Bounding Box */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-medium text-slate-400">
            Área de Interesse (Bounding Box)
          </label>
          <button
            type="button"
            onClick={() => {
              onChange({
                ...config,
                bbox: { lonMin: 0, latMin: 0, lonMax: 0, latMax: 0 },
              })
              if (setMapMode) setMapMode('draw-bbox')
            }}
            className="text-xs text-amber-400 hover:text-amber-300 transition font-medium"
            title="Zerar coordenadas e ativar Desenhar Área no mapa"
          >
            Resetar
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Use a ferramenta <span className="text-cyan-400">Desenhar Área</span> no mapa ou edite manualmente abaixo.
        </p>
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

      {/* Raio por alvo — fixo em 5 km */}
      <div className="flex items-center justify-between py-1">
        <span className="text-xs font-medium text-slate-400">Raio de análise por alvo</span>
        <span className="text-xs font-semibold text-amber-400">5 km</span>
      </div>

      {/* Targets list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-400">
            Pontos de Interesse ({config.targets.length}/5)
          </label>
          <button
            onClick={addTarget}
            disabled={config.targets.length >= 5}
            className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {mapMode === 'add-target' ? 'Clique no mapa' : 'Adicionar'}
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
