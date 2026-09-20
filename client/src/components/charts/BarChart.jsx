import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

export default function CustomBarChart({ data, xKey = 'name', bars = [], height = 280, horizontal = false, showLegend = true, stacked = false, tooltipFormatter, maxBarSize = 50 }) {
  if (!data?.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No data available
      </div>
    );
  }

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#06b6d4'];

  if (horizontal) {
    return (
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              domain={[0, 'dataMax + 10']}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              width={140}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={false}
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
            {bars.map((bar, i) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.label}
                fill={bar.color || colors[i % colors.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={maxBarSize}
                isAnimationActive={false}
                stackId={stacked ? 'stack' : undefined}
              >
                {data.map((entry, idx) => (
                  <Cell key={`cell-${idx}`} fill={bar.color || colors[i % colors.length]} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: showLegend ? 10 : 30, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={{ stroke: '#e2e8f0' }}
            tickLine={false}
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
          {bars.map((bar, i) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.label}
              fill={bar.color || colors[i % colors.length]}
              radius={[0, 0, 4, 4]}
              maxBarSize={maxBarSize}
              isAnimationActive={false}
              stackId={stacked ? 'stack' : undefined}
            >
              {data.map((entry, idx) => (
                <Cell key={`cell-${idx}`} fill={bar.color || colors[i % colors.length]} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}