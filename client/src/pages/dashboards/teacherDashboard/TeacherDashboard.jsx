import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardShell from '../DashboardShell';
import TeacherSidebar from './TeacherSidebar';
import TeacherOverview from './TeacherOverview';
import TeacherDocuments from './TeacherDocuments';
import LiveMap from './LiveMap';
import styles from './TeacherDashboard.module.css';

function TeacherDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Teacher Dashboard" onLogout={onLogout}>
      <div className={styles.layout}>
        <TeacherSidebar />
        <div className={styles.content}>
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
             <Route path="overview" element={<TeacherOverview user={user} />} />
             <Route path="documents" element={<TeacherDocuments user={user} />} />
             <Route path="live-map" element={<LiveMap />} />
             {/* fallback route omitted intentionally */}
          </Routes>
        </div>
      </div>
    </DashboardShell>
  );
}

export default TeacherDashboard;
