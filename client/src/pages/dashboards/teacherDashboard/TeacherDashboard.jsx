import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import TeacherSidebar from './TeacherSidebar';
import TeacherOverview from './TeacherOverview';
import TeacherDocuments from './TeacherDocuments';
import LiveMap from './LiveMap';
import AttendanceReportsRecords from './AttendanceReportsRecords';
import TeacherAttendance from './TeacherAttendance';
import TeacherStudents from './TeacherStudents';
import TeacherStudentEvaluations from './TeacherStudentEvaluations';
import TeacherStudentDocumentation from './TeacherStudentDocumentation';
import TeacherReportsConcerns from './TeacherReportsConcerns';
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
         <Route path="attendance-reports" element={<AttendanceReportsRecords />} />
         <Route path="attendance" element={<TeacherAttendance />} />
          <Route path="student-documentation" element={<TeacherStudentDocumentation />} />
         <Route path="reports-concerns" element={<TeacherReportsConcerns />} />
         <Route path="live-map" element={<LiveMap />} />
        <Route path="appeals" element={<Navigate to="/dashboard/teacher/attendance-reports" replace />} />
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
