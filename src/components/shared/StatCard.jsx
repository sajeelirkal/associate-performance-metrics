import InfoTip from './InfoTip';

export default function StatCard({ label, value, color, tip }) {
  return (
    <div className="stat-card">
      <div className="label">{label}{tip && <InfoTip text={tip} />}</div>
      <div className="value" style={{ color }}>{value}</div>
    </div>
  );
}
