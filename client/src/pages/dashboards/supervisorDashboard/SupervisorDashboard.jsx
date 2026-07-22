import { Routes, Route } from 'react-router-dom';
import DashboardShell from '../DashboardShell';
import SupervisorSidebar from './SupervisorSidebar';
import CreateDeploymentRequest from './CreateDeploymentRequest';
import SupervisorStudents from './SupervisorStudents';
import SupervisorAttendance from './SupervisorAttendance';
import styles from './SupervisorDashboard.module.css';

function SupervisorDashboard({ user, onLogout }) {
  return (
    <DashboardShell user={user} title="Supervisor Dashboard" onLogout={onLogout}>
      <div className={styles.layout}>
        <SupervisorSidebar />
        <div className={styles.content}>
          <Routes>
            <Route index element={<SupervisorOverview user={user} />} />
            <Route path="create-deployment-request" element={<CreateDeploymentRequest />} />
            <Route path="students" element={<SupervisorStudents />} />
            <Route path="attendance" element={<SupervisorAttendance />} />
          </Routes>
        </div>
      </div>
    </DashboardShell>
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
