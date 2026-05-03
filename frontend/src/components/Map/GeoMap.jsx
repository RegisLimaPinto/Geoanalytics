import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip, Circle, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

function FitBounds({ bbox }) {
  const map = useMap()
  useEffect(() => {
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
  const [firstClick, setFirstClick] = useState(null)
  const [hover, setHover] = useState(null)
  const [confirmed, setConfirmed] = useState(null) // bbox flash

  // Refs garantem que o handler sempre lê os valores mais recentes
  const modeRef = useRef(mode)
  const onBboxChangeRef = useRef(onBboxChange)
  const onTargetAddRef = useRef(onTargetAdd)
  modeRef.current = mode
  onBboxChangeRef.current = onBboxChange
  onTargetAddRef.current = onTargetAdd

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      const currentMode = modeRef.current
      console.log('[GeoMap] click', { lat, lng, mode: currentMode })
      if (currentMode === 'draw-bbox') {
        setFirstClick(prev => {
          if (!prev) return { lat, lng }
          const newBbox = {
            lonMin: parseFloat(Math.min(prev.lng, lng).toFixed(4)),
            latMin: parseFloat(Math.min(prev.lat, lat).toFixed(4)),
            lonMax: parseFloat(Math.max(prev.lng, lng).toFixed(4)),
            latMax: parseFloat(Math.max(prev.lat, lat).toFixed(4)),
          }
          setConfirmed(newBbox)
          setTimeout(() => setConfirmed(null), 800)
          onBboxChangeRef.current(newBbox)
          setHover(null)
          return null
        })
      } else if (currentMode === 'add-target') {
        onTargetAddRef.current({ lon: parseFloat(lng.toFixed(5)), lat: parseFloat(lat.toFixed(5)) })
      }
    },
    mousemove(e) {
      if (modeRef.current === 'draw-bbox') setHover(e.latlng)
    },
  })

  // Flash de confirmacao (bbox confirmada)
  if (confirmed) {
    return (
      <Rectangle
        bounds={[
          [confirmed.latMin, confirmed.lonMin],
          [confirmed.latMax, confirmed.lonMax],
        ]}
        pathOptions={{ color: '#22d3ee', weight: 2, fill: true, fillColor: '#22d3ee', fillOpacity: 0.25 }}
      />
    )
  }

  if (mode === 'draw-bbox' && firstClick && hover) {
    return (
      <Rectangle
        bounds={[
          [Math.min(firstClick.lat, hover.lat), Math.min(firstClick.lng, hover.lng)],
          [Math.max(firstClick.lat, hover.lat), Math.max(firstClick.lng, hover.lng)],
        ]}
        pathOptions={{ color: '#22d3ee', weight: 1.5, dashArray: '4 3', fill: true, fillColor: '#22d3ee', fillOpacity: 0.1 }}
      />
    )
  }
  if (mode === 'draw-bbox' && firstClick) {
    return (
      <CircleMarker
        center={[firstClick.lat, firstClick.lng]}
        radius={5}
        pathOptions={{ color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 1, weight: 2 }}
      />
    )
  }
  return null
}

export default function GeoMap({ bbox, targets, radiusKm = 20, mode = 'view', onBboxChange, onTargetAdd }) {
  const center = [
    (bbox.latMin + bbox.latMax) / 2,
    (bbox.lonMin + bbox.lonMax) / 2,
  ]
  const radiusM = radiusKm * 1000

  return (
    <MapContainer
      center={center}
      zoom={8}
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
      <Rectangle
        bounds={[[bbox.latMin, bbox.lonMin], [bbox.latMax, bbox.lonMax]]}
        pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6 5', fill: true, fillColor: '#f59e0b', fillOpacity: 0.10, interactive: false }}
      />

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
