import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function CustomAreaChart({ data, xKey = 'date', areas = [], height = 280, showLegend = true, stacked = false, tooltipFormatter }) {
  if (!data?.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No data available
      </div>
    );
  }

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4'];

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: showLegend ? 10 : 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            domain={[0, 'dataMax + 10']}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            formatter={(value, name) => [
              tooltipFormatter ? tooltipFormatter(value, name) : value,
              name
            ]}
            labelFormatter={(label) => label}
          />
          {showLegend && <Legend wrapperStyle={{ paddingTop: 10 }} />}
          {areas.map((area, i) => (
            <Area
              key={area.dataKey}
              type="monotone"
              dataKey={area.dataKey}
              name={area.label}
              stroke={area.color || colors[i % colors.length]}
              fill={area.color || colors[i % colors.length]}
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
              stackId={stacked ? 'stack' : undefined}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}