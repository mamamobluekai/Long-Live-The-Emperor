import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardShell from '../DashboardShell';
import TeacherSidebar from './TeacherSidebar';
import TeacherOverview from './TeacherOverview';
import TeacherDocuments from './TeacherDocuments';
import LiveMap from './LiveMap';
import TeacherAttendance from './TeacherAttendance';
import TeacherAppeals from './TeacherAppeals';
import TeacherStudents from './TeacherStudents';
import TeacherReports from './TeacherReports';
import TeacherSettings from './TeacherSettings';
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
            <Route path="students" element={<TeacherStudents />} />
            <Route path="attendance" element={<TeacherAttendance />} />
            <Route path="live-map" element={<LiveMap />} />
            <Route path="appeals" element={<TeacherAppeals />} />
            <Route path="reports" element={<TeacherReports />} />
            <Route path="settings" element={<TeacherSettings />} />
            <Route path="documents" element={<TeacherDocuments user={user} />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Routes>
        </div>
      </div>
    </DashboardShell>
  );
}

export default TeacherDashboard;
