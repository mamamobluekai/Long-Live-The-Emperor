import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardShell from '../DashboardShell';
import CoordinatorSidebar from './CoordinatorSidebar';
import StudentApprovals from './StudentApprovals';
import UploadStudents from './UploadStudents';
import RequirementsReview from './RequirementsReview';
import TeacherBatches from './TeacherBatches';
import Supervisors from './Supervisors';
import DeploymentRequests from './DeploymentRequests';
import styles from './CoordinatorDashboard.module.css';

function CoordinatorDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Coordinator Dashboard" onLogout={onLogout}>
      <div className={styles.layout}>
        <CoordinatorSidebar />
        <div className={styles.content}>
          <Routes>
            <Route index element={<Navigate to="students" replace />} />
            <Route path="students" element={<StudentApprovals />} />
            <Route path="upload-students" element={<UploadStudents />} />
            <Route path="requirements" element={<RequirementsReview />} />
            <Route path="batches" element={<TeacherBatches />} />
            <Route path="supervisors" element={<Supervisors />} />
            <Route path="deployment-requests" element={<DeploymentRequests />} />
          </Routes>
        </div>
      </div>
    </DashboardShell>
  );
}

export default CoordinatorDashboard;
