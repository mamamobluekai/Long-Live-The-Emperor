export default function FunnelChart({ stages = [], height = 280 }) {
  if (!stages?.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No data available
      </div>
    );
  }

  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];
  const maxValue = Math.max(...stages.map(s => s.value || 0));

  return (
    <div style={{ width: '100%', height, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {stages.map((stage, i) => {
        const widthPct = maxValue > 0 ? ((stage.value || 0) / maxValue) * 100 : 0;
        const nextStage = stages[i + 1];
        const nextWidthPct = nextStage && maxValue > 0 ? (nextStage.value / maxValue) * 100 : widthPct;
        
        return (
          <div key={stage.label} style={{ width: '100%', maxWidth: 400, position: 'relative' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 4,
              padding: '0 12px'
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>{stage.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{stage.value}</span>
            </div>
            <div
              style={{
                height: 40,
                background: '#f1f5f9',
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
                clipPath: `polygon(0 0, ${widthPct}% 0, ${nextWidthPct}% 100%, 0 100%)`
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '100%',
                  background: colors[i % colors.length],
                  borderRadius: 4,
                }}
              />
            </div>
            {stage.percentage !== undefined && (
              <div style={{ textAlign: 'right', marginTop: 4, fontSize: 12, color: '#64748b' }}>
                {stage.percentage}% of total
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}