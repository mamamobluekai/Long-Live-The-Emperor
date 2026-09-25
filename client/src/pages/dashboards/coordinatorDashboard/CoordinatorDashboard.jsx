import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import CoordinatorSidebar from './CoordinatorSidebar';
import StudentApprovals from './StudentApprovals';
import RequirementsReview from './RequirementsReview';
import TeacherBatches from './TeacherBatches';
import Supervisors from './Supervisors';
import UserProfileSettings from '../UserProfileSettings';
import Announcements from '../Announcements/Announcements';
import CoordinatorOverview from './CoordinatorOverview';

function CoordinatorDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={<DashboardTopNav user={user} onLogout={onLogout} title="Coordinator Dashboard" />}
      sidebar={<CoordinatorSidebar />}
    >
      <Routes>
        <Route index element={<CoordinatorOverview />} />
        <Route path="students" element={<StudentApprovals />} />
        <Route path="upload-students" element={<Navigate to="/dashboard/coordinator/students" replace />} />
         <Route path="requirements" element={<RequirementsReview />} />
         <Route path="announcements" element={<Announcements user={user} />} />
         <Route path="batches" element={<TeacherBatches />} />
         <Route path="supervisors" element={<Supervisors />} />

         <Route path="profile" element={<UserProfileSettings />} />
         <Route path="*" element={<Navigate to="students" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

export default CoordinatorDashboard;
