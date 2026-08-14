import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import TeacherSidebar from './TeacherSidebar';
import TeacherOverview from './TeacherOverview';
import TeacherDocuments from './TeacherDocuments';
import LiveMap from './LiveMap';
import TeacherAttendance from './TeacherAttendance';
import TeacherAppeals from './TeacherAppeals';
import TeacherStudents from './TeacherStudents';
import TeacherStudentEvaluations from './TeacherStudentEvaluations';
import TeacherReports from './TeacherReports';
import TeacherSettings from './TeacherSettings';
import SocialFeed from '../studentDashboard/SocialFeed';
import BatchChat from '../../../components/social/BatchChat';
import UserProfileSettings from '../UserProfileSettings';

function TeacherDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={<DashboardTopNav user={user} onLogout={onLogout} title="Teacher Dashboard" />}
      sidebar={<TeacherSidebar />}
    >
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<TeacherOverview user={user} />} />
         <Route path="students" element={<TeacherStudents />} />
         <Route path="evaluations" element={<TeacherStudentEvaluations />} />
         <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="live-map" element={<LiveMap />} />
        <Route path="appeals" element={<TeacherAppeals />} />
         <Route path="reports" element={<TeacherReports />} />
         <Route path="settings" element={<TeacherSettings />} />
         <Route path="social-feed" element={<SocialFeed />} />
         <Route path="group-chat" element={<BatchChat user={user} />} />
         <Route path="profile" element={<UserProfileSettings />} />
         <Route path="documents" element={<TeacherDocuments user={user} />} />
         <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default TeacherDashboard;
