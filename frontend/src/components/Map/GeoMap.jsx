import { useEffect, useRef } from 'react'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || ''

export default function GeoMap({ bbox, targets }) {
  const hasToken = Boolean(MAPBOX_TOKEN && MAPBOX_TOKEN !== 'YOUR_TOKEN_HERE')

  if (hasToken) {
    return <MapboxView bbox={bbox} targets={targets} />
  }
  return <MapCanvas bbox={bbox} targets={targets} />
}

/* ── Mapbox (quando token configurado) ────────────────────── */
function MapboxView({ bbox, targets }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!mapContainerRef.current) return
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN
      const centerLon = (bbox.lonMin + bbox.lonMax) / 2
      const centerLat = (bbox.latMin + bbox.latMax) / 2

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [centerLon, centerLat],
        zoom: 7.5,
      })

      mapRef.current = map

      map.on('load', () => {
        // Bounding box polygon
        map.addSource('bbox', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [bbox.lonMin, bbox.latMin],
                [bbox.lonMax, bbox.latMin],
                [bbox.lonMax, bbox.latMax],
                [bbox.lonMin, bbox.latMax],
                [bbox.lonMin, bbox.latMin],
              ]],
            },
          },
        })
        map.addLayer({
          id: 'bbox-fill',
          type: 'fill',
          source: 'bbox',
          paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.05 },
        })
        map.addLayer({
          id: 'bbox-outline',
          type: 'line',
          source: 'bbox',
          paint: { 'line-color': '#f59e0b', 'line-width': 1.5, 'line-dasharray': [3, 3] },
        })

        // Target markers
        targets.forEach(({ id, lon, lat }) => {
          const el = document.createElement('div')
          el.className = 'geo-marker'
          el.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px">
              <div style="background:#f59e0b;color:#0f172a;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap">${id}</div>
              <div style="width:10px;height:10px;background:#f59e0b;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px #f59e0b80"></div>
            </div>`
          new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map)
        })
      })
    })

    return () => mapRef.current?.remove()
  }, [bbox, targets])

  return <div ref={mapContainerRef} className="w-full h-full" />
}

/* ── Canvas fallback (sem token) ─────────────────────────── */
function MapCanvas({ bbox, targets }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width: w, height: h } = canvas.getBoundingClientRect()
    canvas.width = w
    canvas.height = h
    drawMap(ctx, w, h, bbox, targets)
  }, [bbox, targets])

  return (
    <div className="relative w-full h-full bg-slate-900">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-4 right-4 bg-slate-900/90 border border-amber-500/30 text-amber-400 text-xs px-3 py-2 rounded-lg backdrop-blur">
        ⚠ Configure <code className="font-mono">VITE_MAPBOX_TOKEN</code> para mapa interativo
      </div>
    </div>
  )
}

function drawMap(ctx, w, h, bbox, targets) {
  const PAD = 48

  // Background
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, w, h)

  // Grid
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 0.5
  for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke() }
  for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke() }

  // Heatmap zones (sintéticas)
  const zones = [
    { nx: 0.28, ny: 0.62, r: 0.14, int: 0.85 },
    { nx: 0.70, ny: 0.32, r: 0.10, int: 0.72 },
    { nx: 0.50, ny: 0.55, r: 0.08, int: 0.60 },
    { nx: 0.38, ny: 0.40, r: 0.06, int: 0.45 },
  ]
  zones.forEach(({ nx, ny, r, int: intensity }) => {
    const cx = PAD + nx * (w - PAD * 2)
    const cy = PAD + ny * (h - PAD * 2)
    const radius = r * Math.min(w, h)
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    grad.addColorStop(0, `rgba(245,158,11,${intensity * 0.75})`)
    grad.addColorStop(0.45, `rgba(245,158,11,${intensity * 0.3})`)
    grad.addColorStop(1, 'rgba(245,158,11,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.fill()
  })

  // Bounding box outline
  ctx.strokeStyle = '#475569'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  ctx.strokeRect(PAD, PAD, w - PAD * 2, h - PAD * 2)
  ctx.setLineDash([])

  // Coordinate labels
  ctx.font = '10px monospace'
  ctx.fillStyle = '#475569'
  ctx.fillText(`${bbox.lonMin.toFixed(2)}°W`, PAD, PAD - 8)
  ctx.fillText(`${bbox.lonMax.toFixed(2)}°W`, w - PAD - 40, PAD - 8)
  ctx.fillText(`${bbox.latMax.toFixed(2)}°S`, 4, PAD + 6)
  ctx.fillText(`${bbox.latMin.toFixed(2)}°S`, 4, h - PAD)

  // Targets
  const { lonMin, latMin, lonMax, latMax } = bbox
  targets.forEach(({ id, lon, lat }) => {
    const tx = PAD + ((lon - lonMin) / (lonMax - lonMin)) * (w - PAD * 2)
    const ty = PAD + ((latMax - lat) / (latMax - latMin)) * (h - PAD * 2)

    // Pulse ring
    ctx.strokeStyle = 'rgba(245,158,11,0.25)'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.arc(tx, ty, 18, 0, Math.PI * 2)
    ctx.stroke()

    // Main ring
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(tx, ty, 10, 0, Math.PI * 2)
    ctx.stroke()

    // Center dot
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.arc(tx, ty, 3.5, 0, Math.PI * 2)
    ctx.fill()

    // Label background
    const lw = 26
    ctx.fillStyle = 'rgba(15,23,42,0.85)'
    ctx.fillRect(tx + 14, ty - 10, lw, 16)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1
    ctx.strokeRect(tx + 14, ty - 10, lw, 16)

    // Label text
    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(id, tx + 17, ty + 2)
  })

  // Legend
  const lx = 12, ly = h - 90
  ctx.fillStyle = 'rgba(15,23,42,0.9)'
  ctx.fillRect(lx, ly, 148, 82)
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1
  ctx.strokeRect(lx, ly, 148, 82)

  ctx.font = 'bold 10px sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText('PSI Index (sintético)', lx + 8, ly + 18)

  const gradLeg = ctx.createLinearGradient(lx + 8, 0, lx + 136, 0)
  gradLeg.addColorStop(0, 'rgba(15,23,42,0.5)')
  gradLeg.addColorStop(1, 'rgba(245,158,11,0.85)')
  ctx.fillStyle = gradLeg
  ctx.fillRect(lx + 8, ly + 26, 130, 14)

  ctx.fillStyle = '#64748b'
  ctx.font = '9px monospace'
  ctx.fillText('0.0 Baixo', lx + 8, ly + 56)
  ctx.fillText('Alto 1.0', lx + 96, ly + 56)

  ctx.fillStyle = '#f59e0b'
  ctx.font = 'bold 10px sans-serif'
  ctx.fillText('● Alvo exploratório', lx + 8, ly + 72)
}
