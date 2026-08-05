import { useState, useMemo } from 'react';
import styles from './DataTable.module.css';

export default function DataTable({
  columns,
  data,
  rowKey = 'id',
  actions,
  sortable = true,
  emptyMessage = 'No records found.',
}) {
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  const handleHeaderClick = (key) => {
    if (!sortable || !key) return;
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey || !data) return data;
    const sortedData = [...data].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sortedData;
  }, [data, sortKey, sortDir]);

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key || col.header}
                onClick={() => handleHeaderClick(col.key)}
                className={(sortable && col.key) ? styles.sortable : undefined}
              >
                {col.header}
                {sortable && col.key && sortKey === col.key ? (
                  <span className={styles.sortIndicator}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                ) : null}
              </th>
            ))}
            {actions ? <th className={styles.actionHeader}>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {sorted && sorted.length > 0 ? (
            sorted.map((row) => (
              <tr key={row[rowKey] || row.id}>
                {columns.map((col) => (
                  <td key={col.key || col.header}>
                    {col.render ? col.render(row[col.key], row) : row[col.key] !== undefined ? String(row[col.key]) : ''}
                  </td>
                ))}
                {actions ? (
                  <td className={styles.actionCell}>{actions(row)}</td>
                ) : null}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + (actions ? 1 : 0)} className={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
