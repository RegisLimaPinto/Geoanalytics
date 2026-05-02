import { useRef, useState } from 'react'
import { ArrowUpTrayIcon, CheckCircleIcon, XCircleIcon, TrashIcon } from '@heroicons/react/24/outline'

const LAYERS = [
  {
    key: 'gravimetria',
    label: 'Gravimetria',
    hint: 'Anomalia gravimétrica absoluta',
    internal: 'GRAV',
  },
  {
    key: 'magnetometria',
    label: 'Magnetometria',
    hint: 'Campo magnético total / redução ao polo',
    internal: 'MAG',
  },
  {
    key: 'bouguer',
    label: 'Bouguer',
    hint: 'Anomalia Bouguer (redução gravimétrica)',
    internal: 'GRAV',
  },
  {
    key: 'ternario_k',
    label: 'Ternário — K',
    hint: 'Potássio radiométrico (%)',
    internal: 'K',
  },
  {
    key: 'ternario_u',
    label: 'Ternário — U',
    hint: 'Urânio equivalente (ppm)',
    internal: 'U',
  },
  {
    key: 'ternario_th',
    label: 'Ternário — Th',
    hint: 'Tório equivalente (ppm)',
    internal: 'Th',
  },
]

export default function DataUpload({ config, token }) {
  const [states, setStates] = useState({}) // key → { status: idle|loading|ok|error, info }
  const inputRefs = useRef({})

  const setLayerState = (key, val) =>
    setStates(s => ({ ...s, [key]: val }))

  async function handleFile(layerKey, file) {
    if (!file) return
    setLayerState(layerKey, { status: 'loading' })

    const form = new FormData()
    form.append('layer_key', layerKey)
    form.append('bbox_lon_min', config.bbox.lonMin)
    form.append('bbox_lat_min', config.bbox.latMin)
    form.append('bbox_lon_max', config.bbox.lonMax)
    form.append('bbox_lat_max', config.bbox.latMax)
    form.append('resolution', config.resolution)
    form.append('file', file)

    try {
      const res = await fetch('/api/analysis/upload-layer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Erro no upload')
      setLayerState(layerKey, {
        status: 'ok',
        info: `${data.shape[0]}×${data.shape[1]} px · min ${data.min} / max ${data.max}`,
        filename: data.filename,
      })
    } catch (e) {
      setLayerState(layerKey, { status: 'error', info: e.message })
    }
  }

  async function handleClearAll() {
    await fetch('/api/analysis/upload-layer', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setStates({})
    Object.values(inputRefs.current).forEach(el => { if (el) el.value = '' })
  }

  const anyUploaded = Object.values(states).some(s => s.status === 'ok')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-slate-300">Dados do Cliente</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">CSV ou GeoTIFF (.tif)</p>
        </div>
        {anyUploaded && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300 transition"
          >
            <TrashIcon className="w-3 h-3" />
            Limpar
          </button>
        )}
      </div>

      <div className="space-y-2">
        {LAYERS.map(layer => {
          const state = states[layer.key] || { status: 'idle' }
          const isOk = state.status === 'ok'
          const isErr = state.status === 'error'
          const isLoading = state.status === 'loading'

          return (
            <div
              key={layer.key}
              onClick={() => inputRefs.current[layer.key]?.click()}
              className={`relative cursor-pointer rounded-lg border px-3 py-2.5 transition group
                ${isOk
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : isErr
                  ? 'border-rose-500/50 bg-rose-500/5'
                  : 'border-slate-700 bg-slate-800/40 hover:border-amber-500/40 hover:bg-amber-500/5'
                }`}
            >
              <input
                ref={el => { inputRefs.current[layer.key] = el }}
                type="file"
                accept=".csv,.tif,.tiff"
                className="hidden"
                onChange={e => handleFile(layer.key, e.target.files?.[0])}
              />

              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isOk ? (
                      <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    ) : isErr ? (
                      <XCircleIcon className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    ) : isLoading ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin flex-shrink-0" />
                    ) : (
                      <ArrowUpTrayIcon className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 flex-shrink-0 transition" />
                    )}
                    <span className={`text-xs font-medium ${isOk ? 'text-emerald-300' : isErr ? 'text-rose-300' : 'text-slate-300'}`}>
                      {layer.label}
                    </span>
                    <span className="text-[9px] text-slate-600 font-mono">[{layer.internal}]</span>
                  </div>

                  {isOk && (
                    <p className="text-[10px] text-emerald-500 mt-0.5 truncate">{state.filename} · {state.info}</p>
                  )}
                  {isErr && (
                    <p className="text-[10px] text-rose-400 mt-0.5 line-clamp-2">{state.info}</p>
                  )}
                  {!isOk && !isErr && !isLoading && (
                    <p className="text-[10px] text-slate-600 mt-0.5">{layer.hint}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {anyUploaded && (
        <p className="text-[10px] text-amber-400/70 text-center">
          Camadas enviadas substituirão os dados automáticos na análise
        </p>
      )}
    </div>
  )
}
