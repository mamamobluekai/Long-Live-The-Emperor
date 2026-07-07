function PageCard({ title, subtitle, children, actions }) {
  return (
    <div style={{ background: 'white', borderRadius: 20, padding: 24, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {subtitle ? <p style={{ margin: '6px 0 0', color: '#64748b' }}>{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export default PageCard;
