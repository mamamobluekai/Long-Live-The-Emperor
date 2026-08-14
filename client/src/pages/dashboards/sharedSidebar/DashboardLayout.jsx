import styles from './DashboardLayout.module.css';

function DashboardLayout({ topNav, sidebar, children }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topNav}>{topNav}</header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>{sidebar}</aside>
        <main className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;