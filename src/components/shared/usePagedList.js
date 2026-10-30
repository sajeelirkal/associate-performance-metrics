import { useState, useMemo } from 'react';
import { PAGE_SIZE } from '../../utils/helpers';

/**
 * Paginate a list for display: page state, the PAGE_SIZE slice, and total pages.
 * Pass `resetKey` (e.g. the active associate) to jump back to page 1 when it changes.
 */
export default function usePagedList(items, resetKey) {
  const [page, setPage] = useState(1);

  const [prevReset, setPrevReset] = useState(resetKey);
  if (resetKey !== prevReset) {
    setPrevReset(resetKey);
    setPage(1);
  }

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return items.slice(s, s + PAGE_SIZE);
  }, [items, page]);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);

  return { page, setPage, paged, totalPages };
}
