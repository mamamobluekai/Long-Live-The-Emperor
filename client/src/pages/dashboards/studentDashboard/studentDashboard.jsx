import DashboardShell from '../DashboardShell';
import StudentSidebar from './StudentSidebar';
import Overview from './Overview';
import Requirements from './Requirements';
import Documentation from './Documentation';
import PlacementStatus from './PlacementStatus';
import Announcements from './Announcements';
import Attendance from './Attendance';
import { Routes, Route, Navigate } from 'react-router-dom';
import styles from './StudentDashboard.module.css';

function StudentDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Student Dashboard" onLogout={onLogout}>
      <div className={styles.layout}>
        <StudentSidebar />
        <div className={styles.content}>
          <Routes>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<Overview user={user} />} />
            <Route path="requirements" element={<Requirements user={user} />} />
            <Route path="documentation" element={<Documentation user={user} />} />
            <Route path="placement-status" element={<PlacementStatus />} />
             <Route path="announcements" element={<Announcements />} />
             <Route path="attendance" element={<Attendance />} />
             <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </div>
      </div>
    </DashboardShell>
  );
}

export default StudentDashboard;
