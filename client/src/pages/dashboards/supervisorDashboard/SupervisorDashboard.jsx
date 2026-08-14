import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import SupervisorSidebar from './SupervisorSidebar';
import CreateDeploymentRequest from './CreateDeploymentRequest';
import SupervisorStudents from './SupervisorStudents';
import SupervisorAttendance from './SupervisorAttendance';
import SupervisorEvaluateStudent from './SupervisorEvaluateStudent';
import SupervisorEvaluation from './SupervisorEvaluation';
import SupervisorCertifications from './SupervisorCertifications';
import SocialFeed from '../studentDashboard/SocialFeed';
import BatchChat from '../../../components/social/BatchChat';
import UserProfileSettings from '../UserProfileSettings';
import styles from './SupervisorDashboard.module.css';

function SupervisorDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={<DashboardTopNav user={user} onLogout={onLogout} title="Supervisor Dashboard" />}
      sidebar={<SupervisorSidebar />}
    >
      <Routes>
        <Route index element={<SupervisorOverview user={user} />} />
        <Route path="create-deployment-request" element={<CreateDeploymentRequest />} />
         <Route path="students" element={<SupervisorStudents />} />
         <Route path="attendance" element={<SupervisorAttendance />} />
         <Route path="evaluate" element={<SupervisorEvaluateStudent />} />
         <Route path="evaluation" element={<SupervisorEvaluation />} />
         <Route path="certifications" element={<SupervisorCertifications />} />
         <Route path="social-feed" element={<SocialFeed />} />
         <Route path="group-chat" element={<BatchChat user={user} />} />
         <Route path="profile" element={<UserProfileSettings />} />
         <Route path="*" element={<Navigate to="evaluate" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

function SupervisorOverview({ user }) {
  return (
    <div>
      <div className={styles.pageHeader}>
        <h2>Welcome, {user?.email}</h2>
        <p>
          Need interns for your company? Send a deployment request with the number of students required.
          The coordinator will assign the students for you.
        </p>
      </div>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h3>Create Deployment Request</h3>
          <p>Request students by specifying how many you need.</p>
        </div>
        <div className={styles.card}>
          <h3>My Requests</h3>
          <p>Track the status of your deployment requests and assigned students.</p>
        </div>
        <div className={styles.card}>
          <h3>Company Updates</h3>
          <p>Share updates with the school and coordinator team.</p>
        </div>
      </div>
    </div>
  );
}

export default SupervisorDashboard;
