import { useState, useEffect } from 'react';

/**
 * useState that loads its initial value from storage and persists every change.
 * Empty/null values remove the key. `{ json: true }` stringifies/parses; pass
 * `validate` to reject structurally-wrong stored values (falls back to `initial`).
 * Use `{ storage: 'session' }` for credentials: cleared when the tab closes.
 */
export default function usePersistentState(key, initial, { json = false, validate = () => true, storage = 'local' } = {}) {
  const [value, setValue] = useState(() => {
    try {
      const raw = (storage === 'session' ? sessionStorage : localStorage).getItem(key);
      if (raw == null || raw === '') return initial;
      if (!json) return raw;
      const parsed = JSON.parse(raw);
      return validate(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      const store = storage === 'session' ? sessionStorage : localStorage;
      const s = json ? JSON.stringify(value) : value;
      if (s === '' || s == null) store.removeItem(key);
      else store.setItem(key, s);
    } catch { /* storage full or blocked — keep in-memory value */ }
  }, [key, value, json, storage]);

  return [value, setValue];
}
