import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import StudentSidebar from './StudentSidebar';
import Overview from './Overview';
import Requirements from './Requirements';
import PlacementStatus from './PlacementStatus';
import Announcements from '../Announcements/Announcements';
import Attendance from './Attendance';
import DailyDocumentation from './DailyDocumentation';
import Progress from './Progress';
import StudentEvaluation from './StudentEvaluation';
import StudentGradeAppeal from './StudentGradeAppeal';
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
          <Route path="overview" element={<Overview user={user} />} />
        <Route path="progress" element={<Progress />} />
        <Route path="requirements" element={<Requirements user={user} />} />
        <Route path="placement-status" element={<PlacementStatus user={user} />} />
        <Route path="evaluation" element={<StudentEvaluation />} />
        <Route path="grade-appeal" element={<StudentGradeAppeal />} />
        <Route path="announcements" element={<Announcements user={user} />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="daily-documentation" element={<DailyDocumentation />} />
        <Route path="group-chat" element={<BatchChat user={user} />} />
        <Route path="profile" element={<UserProfileSettings />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default StudentDashboard;
