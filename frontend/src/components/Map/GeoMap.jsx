import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip, Circle, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

function FitBounds({ bbox }) {
  const map = useMap()
  useEffect(() => {
    const dLat = Math.abs(bbox.latMax - bbox.latMin)
    const dLon = Math.abs(bbox.lonMax - bbox.lonMin)
    if (dLat < 0.001 || dLon < 0.001) {
      // bbox zerada/degenerada: volta para vista do Brasil em vez de zoom infinito em [0,0]
      map.setView([-10, -50], 4)
      return
    }
    map.fitBounds([
      [bbox.latMin, bbox.lonMin],
      [bbox.latMax, bbox.lonMax],
    ], { padding: [80, 80] })
  }, [bbox, map])
  return null
}

function CursorManager({ mode }) {
  const map = useMap()
  useEffect(() => {
    const c = map.getContainer()
    c.style.cursor = (mode === 'draw-bbox' || mode === 'add-target') ? 'crosshair' : ''
  }, [mode, map])
  return null
}

function MapInteraction({ mode, onBboxChange, onTargetAdd }) {
  const map = useMap()
  const [dragStart, setDragStart] = useState(null)
  const [dragCurrent, setDragCurrent] = useState(null)
  const [confirmed, setConfirmed] = useState(null) // bbox flash

  // Refs para sempre ler valores recentes nos handlers
  const modeRef = useRef(mode)
  const onBboxChangeRef = useRef(onBboxChange)
  const onTargetAddRef = useRef(onTargetAdd)
  const dragStartRef = useRef(dragStart)
  const dragCurrentRef = useRef(dragCurrent)
  modeRef.current = mode
  onBboxChangeRef.current = onBboxChange
  onTargetAddRef.current = onTargetAdd
  dragStartRef.current = dragStart
  dragCurrentRef.current = dragCurrent

  function updateDragStart(value) {
    dragStartRef.current = value
    setDragStart(value)
  }

  function updateDragCurrent(value) {
    dragCurrentRef.current = value
    setDragCurrent(value)
  }

  // Desabilita pan/zoom enquanto desenha bbox para o arrastar nao mover o mapa
  useEffect(() => {
    if (mode === 'draw-bbox') {
      map.dragging.disable()
      map.boxZoom.disable()
      map.doubleClickZoom.disable()
    } else {
      map.dragging.enable()
      map.boxZoom.enable()
      map.doubleClickZoom.enable()
      updateDragStart(null)
      updateDragCurrent(null)
    }
  }, [mode, map])

  useMapEvents({
    mousedown(e) {
      if (modeRef.current !== 'draw-bbox') return
      updateDragStart(e.latlng)
      updateDragCurrent(e.latlng)
    },
    mousemove(e) {
      if (modeRef.current === 'draw-bbox' && dragStartRef.current) {
        updateDragCurrent(e.latlng)
      }
    },
    mouseup(e) {
      if (modeRef.current !== 'draw-bbox' || !dragStartRef.current) return
      const a = dragStartRef.current
      const b = e.latlng
      const dLat = Math.abs(a.lat - b.lat)
      const dLng = Math.abs(a.lng - b.lng)
      // ignora cliques sem arrasto significativo (< ~0.01deg)
      if (dLat < 0.005 && dLng < 0.005) {
        updateDragStart(null)
        updateDragCurrent(null)
        return
      }
      const newBbox = {
        lonMin: parseFloat(Math.min(a.lng, b.lng).toFixed(4)),
        latMin: parseFloat(Math.min(a.lat, b.lat).toFixed(4)),
        lonMax: parseFloat(Math.max(a.lng, b.lng).toFixed(4)),
        latMax: parseFloat(Math.max(a.lat, b.lat).toFixed(4)),
      }
      console.log('[GeoMap] bbox draw', newBbox)
      setConfirmed(newBbox)
      setTimeout(() => setConfirmed(null), 800)
      onBboxChangeRef.current(newBbox)
      updateDragStart(null)
      updateDragCurrent(null)
    },
    click(e) {
      const currentMode = modeRef.current
      if (currentMode === 'add-target') {
        const { lat, lng } = e.latlng
        console.log('[GeoMap] click add-target', { lat, lng })
        onTargetAddRef.current({ lon: parseFloat(lng.toFixed(5)), lat: parseFloat(lat.toFixed(5)) })
      }
    },
  })

  // Flash de confirmacao
  if (confirmed) {
    return (
      <Rectangle
        bounds={[
          [confirmed.latMin, confirmed.lonMin],
          [confirmed.latMax, confirmed.lonMax],
        ]}
        pathOptions={{ color: '#22d3ee', weight: 2, fill: true, fillColor: '#22d3ee', fillOpacity: 0.25, interactive: false }}
      />
    )
  }

  // Preview enquanto arrasta
  if (mode === 'draw-bbox' && dragStart && dragCurrent) {
    return (
      <Rectangle
        bounds={[
          [Math.min(dragStart.lat, dragCurrent.lat), Math.min(dragStart.lng, dragCurrent.lng)],
          [Math.max(dragStart.lat, dragCurrent.lat), Math.max(dragStart.lng, dragCurrent.lng)],
        ]}
        pathOptions={{ color: '#22d3ee', weight: 2, dashArray: '4 3', fill: true, fillColor: '#22d3ee', fillOpacity: 0.15, interactive: false }}
      />
    )
  }
  return null
}

export default function GeoMap({ bbox, targets, radiusKm = 20, mode = 'view', onBboxChange, onTargetAdd }) {
  const bboxValid = Math.abs(bbox.latMax - bbox.latMin) > 0.001 && Math.abs(bbox.lonMax - bbox.lonMin) > 0.001
  const center = bboxValid
    ? [(bbox.latMin + bbox.latMax) / 2, (bbox.lonMin + bbox.lonMax) / 2]
    : [-10, -50] // Brasil central como fallback quando bbox zerada
  const radiusM = radiusKm * 1000

  return (
    <MapContainer
      center={center}
      zoom={bboxValid ? 8 : 4}
      className="w-full h-full"
      zoomControl={true}
      scrollWheelZoom={true}
      style={{ background: '#0f172a' }}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={18} />
      <FitBounds bbox={bbox} />
      <CursorManager mode={mode} />
      {onBboxChange && onTargetAdd && (
        <MapInteraction mode={mode} onBboxChange={onBboxChange} onTargetAdd={onTargetAdd} />
      )}

      {/* Bounding box da area de analise - fill mais visivel, nao-interativa para nao bloquear cliques */}
      {bboxValid && (
        <Rectangle
          bounds={[[bbox.latMin, bbox.lonMin], [bbox.latMax, bbox.lonMax]]}
          pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6 5', fill: true, fillColor: '#f59e0b', fillOpacity: 0.10, interactive: false }}
        />
      )}

      {/* Raio de analise por alvo - nao-interativo */}
      {targets.map(t => (
        <Circle
          key={`radius-${t.id}`}
          center={[t.lat, t.lon]}
          radius={radiusM}
          pathOptions={{
            color: '#f59e0b', weight: 1, dashArray: '5 4',
            fill: true, fillColor: '#f59e0b',
            fillOpacity: t.psiScore ? Math.max(0.05, (t.psiScore ?? 0.5) * 0.18) : 0.07,
            interactive: false,
          }}
        />
      ))}

      {/* Marcadores de alvo - pontos sem psiScore (recem-adicionados) sao maiores e ciano */}
      {targets.map(t => {
        const isPending = t.psiScore === undefined
        return (
          <CircleMarker
            key={t.id}
            center={[t.lat, t.lon]}
            radius={isPending ? 11 : 8}
            pathOptions={{
              color: isPending ? '#22d3ee' : '#f59e0b',
              weight: isPending ? 3 : 2,
              fillColor: isPending ? '#22d3ee' : '#0f172a',
              fillOpacity: isPending ? 0.7 : 0.9,
            }}
          >
            <Tooltip permanent direction="right" offset={[12, 0]}>
              <span style={{
                color: isPending ? '#67e8f9' : '#fbbf24',
                fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
              }}>
                {t.id}
                {!isPending && (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}> - {(t.psiScore * 100).toFixed(0)}%</span>
                )}
                {isPending && (
                  <span style={{ color: '#94a3b8', fontWeight: 400 }}> ({t.lon.toFixed(2)}, {t.lat.toFixed(2)})</span>
                )}
              </span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
