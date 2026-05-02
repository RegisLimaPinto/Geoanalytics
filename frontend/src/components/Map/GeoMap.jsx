import { useEffect } from 'react'
import { MapContainer, TileLayer, Rectangle, CircleMarker, Tooltip, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// CartoDB Dark Matter � gratuito, sem token, sem limite
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

function FitBounds({ bbox }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds([
      [bbox.latMin, bbox.lonMin],
      [bbox.latMax, bbox.lonMax],
    ], { padding: [24, 24] })
  }, [bbox, map])
  return null
}

export default function GeoMap({ bbox, targets, radiusKm = 20 }) {
  const center = [
    (bbox.latMin + bbox.latMax) / 2,
    (bbox.lonMin + bbox.lonMax) / 2,
  ]

  // Raio em metros para o Leaflet
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

      {/* Bounding box da area de analise */}
      <Rectangle
        bounds={[[bbox.latMin, bbox.lonMin], [bbox.latMax, bbox.lonMax]]}
        pathOptions={{ color: '#f59e0b', weight: 1.5, dashArray: '6 5', fill: true, fillColor: '#f59e0b', fillOpacity: 0.04 }}
      />

      {/* Raio de análise real por alvo (= radiusKm configurado) */}
      {targets.map(t => (
        <Circle
          key={`radius-${t.id}`}
          center={[t.lat, t.lon]}
          radius={radiusM}
          pathOptions={{
            color: '#f59e0b',
            weight: 1,
            dashArray: '5 4',
            fill: true,
            fillColor: '#f59e0b',
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
                <span style={{ color: '#94a3b8', fontWeight: 400 }}> � {(t.psiScore * 100).toFixed(0)}%</span>
              )}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
