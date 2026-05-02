import { useEffect, useState } from 'react'
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

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng
      if (mode === 'draw-bbox') {
        if (!firstClick) {
          setFirstClick({ lat, lng })
        } else {
          const newBbox = {
            lonMin: parseFloat(Math.min(firstClick.lng, lng).toFixed(4)),
            latMin: parseFloat(Math.min(firstClick.lat, lat).toFixed(4)),
            lonMax: parseFloat(Math.max(firstClick.lng, lng).toFixed(4)),
            latMax: parseFloat(Math.max(firstClick.lat, lat).toFixed(4)),
          }
          setConfirmed(newBbox)
          setTimeout(() => setConfirmed(null), 800)
          onBboxChange(newBbox)
          setFirstClick(null)
          setHover(null)
        }
      } else if (mode === 'add-target') {
        onTargetAdd({ lon: parseFloat(lng.toFixed(5)), lat: parseFloat(lat.toFixed(5)) })
      }
    },
    mousemove(e) {
      if (mode === 'draw-bbox' && firstClick) setHover(e.latlng)
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

      {/* Bounding box da area de analise - fill mais visivel */}
      <Rectangle
        bounds={[[bbox.latMin, bbox.lonMin], [bbox.latMax, bbox.lonMax]]}
        pathOptions={{ color: '#f59e0b', weight: 2, dashArray: '6 5', fill: true, fillColor: '#f59e0b', fillOpacity: 0.10 }}
      />

      {/* Raio de analise por alvo */}
      {targets.map(t => (
        <Circle
          key={`radius-${t.id}`}
          center={[t.lat, t.lon]}
          radius={radiusM}
          pathOptions={{
            color: '#f59e0b', weight: 1, dashArray: '5 4',
            fill: true, fillColor: '#f59e0b',
            fillOpacity: t.psiScore ? Math.max(0.05, (t.psiScore ?? 0.5) * 0.18) : 0.07,
          }}
        />
      ))}

      {/* Marcadores de alvo */}
      {targets.map(t => (
        <CircleMarker
          key={t.id}
          center={[t.lat, t.lon]}
          radius={8}
          pathOptions={{ color: '#f59e0b', weight: 2, fillColor: '#0f172a', fillOpacity: 0.9 }}
        >
          <Tooltip permanent direction="right" offset={[10, 0]}>
            <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: 11, fontFamily: 'monospace' }}>
              {t.id}
              {t.psiScore !== undefined && (
                <span style={{ color: '#94a3b8', fontWeight: 400 }}> - {(t.psiScore * 100).toFixed(0)}%</span>
              )}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
