import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

// ── Radar de camadas geofísicas ───────────────────────────────────────────────
export function LayerRadar({ layers }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={layers}>
        <PolarGrid stroke="#334155" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 10 }}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, 1]}
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickCount={4}
        />
        <Radar
          name="Anomalia"
          dataKey="anomaly"
          stroke="#f59e0b"
          fill="#f59e0b"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          itemStyle={{ color: '#fbbf24' }}
          formatter={(v) => [v.toFixed(2), 'PSI Normalizado']}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}

// ── Barras K-U-Th por alvo ───────────────────────────────────────────────────
const KUTh_COLORS = { K: '#f59e0b', U: '#60a5fa', Th: '#34d399' }

export function KUThBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          formatter={(v, name) => [`${v}%`, name]}
        />
        {['K', 'U', 'Th'].map((key) => (
          <Bar key={key} dataKey={key} fill={KUTh_COLORS[key]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Barras horizontais de PSI Index por alvo ─────────────────────────────────
export function PSIBars({ targets }) {
  const sorted = [...targets].sort((a, b) => b.psiScore - a.psiScore)

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={sorted} layout="vertical" barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 1]}
          tick={{ fill: '#64748b', fontSize: 9 }}
          tickFormatter={(v) => v.toFixed(1)}
        />
        <YAxis type="category" dataKey="id" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} width={28} />
        <Tooltip
          contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
          formatter={(v) => [v.toFixed(3), 'PSI Score']}
        />
        <Bar dataKey="psiScore" radius={[0, 4, 4, 0]}>
          {sorted.map((entry) => (
            <Cell
              key={entry.id}
              fill={entry.psiScore > 0.8 ? '#f59e0b' : entry.psiScore > 0.6 ? '#fb923c' : '#94a3b8'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
