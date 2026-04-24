export default function ChartTooltip({ active, payload, label, showLink }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#21262d', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <p style={{ color:'#8b949e', marginBottom:6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
      {showLink && payload[0]?.value > 0 && (
        <p style={{ color:'#58a6ff', marginTop:6, fontSize:11 }}>Click to open on GitHub ↗</p>
      )}
    </div>
  );
}
