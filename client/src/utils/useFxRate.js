import { useEffect, useState } from 'react';
import { fxApi } from '../api';

// MYR per 1 SGD for a given date (latest rate on/before it — same rule the
// server uses when it saves the rate onto a MY sale). Only used for on-screen
// previews; the server always stamps the authoritative rate when saving.
export default function useFxRate(date) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    fxApi.get().then(d => {
      const all = [...(d.history || [])];
      if (d.current && !all.find(r => r.date === d.current.date)) all.push(d.current);
      setRows(all.sort((a, b) => (a.date < b.date ? 1 : -1)));
    }).catch(() => {});
  }, []);
  const hit = rows.find(r => r.date <= (date || '9999')) || rows[rows.length - 1];
  return hit ? parseFloat(hit.myr_per_sgd) : null;
}
