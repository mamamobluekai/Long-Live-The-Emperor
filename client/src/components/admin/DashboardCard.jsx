import styles from './DashboardCard.module.css';

export default function DashboardCard({ title, value, icon: Icon, trend, trendUp, color = 'primary' }) {
  return (
    <div className={`${styles.card} ${styles[color]}`}>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {Icon ? <span className={styles.icon}>{Icon}</span> : null}
      </div>
      <div className={styles.value}>{value}</div>
      {trend != null && (
        <div className={`${styles.trend} ${trendUp ? styles.trendUp : styles.trendDown}`}>
          {trendUp ? '▲' : '▼'} {trend}
        </div>
      )}
    </div>
  );
}
