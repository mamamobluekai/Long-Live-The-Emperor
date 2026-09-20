import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

export default function CustomDonutChart({ data, height = 280, showLegend = true, innerRadius = 60, outerRadius = 80, tooltipFormatter }) {
  const total = data?.reduce((sum, d) => sum + (d.value || 0), 0) || 0;

  if (!data?.length || total === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No data available
      </div>
    );
  }

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4'];

  return (
    <div style={{ width: '100%', height, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
            nameKey="label"
            label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((_, i) => (
              <Cell key={`cell-${i}`} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            formatter={(value, name) => [
              tooltipFormatter ? tooltipFormatter(value, name) : value,
              name
            ]}
          />
        </PieChart>
      </ResponsiveContainer>
      {showLegend && (
        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px 24px' }}>
          {data.map((item, i) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#475569' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: colors[i % colors.length], display: 'inline-block' }} />
              <span>{item.label}</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}