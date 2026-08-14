import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import StudentSidebar from './StudentSidebar';
import Overview from './Overview';
import Requirements from './Requirements';
import Documentation from './Documentation';
import PlacementStatus from './PlacementStatus';
import Announcements from './Announcements';
import Attendance from './Attendance';
import Progress from './Progress';
import StudentEvaluation from './StudentEvaluation';
import BatchChat from '../../../components/social/BatchChat';
import UserProfileSettings from '../UserProfileSettings';

function StudentDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={<DashboardTopNav user={user} onLogout={onLogout} title="Student Dashboard" />}
      sidebar={<StudentSidebar />}
    >
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="progress" element={<Progress />} />
        <Route path="requirements" element={<Requirements user={user} />} />
        <Route path="documentation" element={<Documentation user={user} />} />
        <Route path="placement-status" element={<PlacementStatus />} />
        <Route path="evaluation" element={<StudentEvaluation />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="group-chat" element={<BatchChat user={user} />} />
        <Route path="profile" element={<UserProfileSettings />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default StudentDashboard;
