import { useState, cloneElement } from 'react';
import styles from './DashboardLayout.module.css';

function DashboardLayout({
  topNav,
  sidebar,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleOpenSidebar = () => {
    console.log('menu clicked');
    setSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
  };

  const topNavWithProps = cloneElement(topNav, {
    onMenuClick: handleOpenSidebar,
  });

  const sidebarWithProps = cloneElement(sidebar, {
    isOpen: sidebarOpen,
    onClose: handleCloseSidebar,
  });
  

  return (
    <div className={styles.shell}>

      {/* =====================================
          TOP NAVIGATION
      ===================================== */}

      <div className={styles.topNav}>
        {topNavWithProps}
      </div>


      {/* =====================================
          MAIN LAYOUT
      ===================================== */}

      <div className={styles.layout}>

        {/* SIDEBAR */}

        <div className={styles.sidebar}>

          {sidebarWithProps}
        </div>


        {/* CONTENT */}

        <main className={styles.content}>
          <div className={styles.contentInner}>
            {children}
          </div>
        </main>

      </div>

    </div>
  );
}

export default DashboardLayout;