export default function InfoTip({ text }) {
  return (
    <span className="infotip-wrap">
      <span className="infotip-icon" aria-label="info">ⓘ</span>
      <span className="infotip-bubble" role="tooltip">{text}</span>
    </span>
  );
}
