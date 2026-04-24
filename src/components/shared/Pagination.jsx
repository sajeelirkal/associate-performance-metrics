export default function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn btn-outline" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} style={{ padding:'4px 12px' }}>←</button>
      <span>Page {page} of {totalPages}</span>
      <button className="btn btn-outline" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ padding:'4px 12px' }}>→</button>
    </div>
  );
}
