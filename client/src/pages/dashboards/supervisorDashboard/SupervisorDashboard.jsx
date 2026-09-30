import { Routes, Route, Navigate } from 'react-router-dom';

import DashboardLayout from '../sharedSidebar/DashboardLayout';
import DashboardTopNav from '../sharedSidebar/DashboardTopNav';
import SupervisorSidebar from './SupervisorSidebar';
import CreateDeploymentRequest from './CreateDeploymentRequest';
import SupervisorStudents from './SupervisorStudents';
import SupervisorAttendance from './SupervisorAttendance';
import SupervisorReportsConcerns from './SupervisorReportsConcerns';
import SupervisorSchedule from './SupervisorSchedule';
import SupervisorEvaluateStudent from './SupervisorEvaluateStudent';
import SupervisorEvaluation from './SupervisorEvaluation';
import SupervisorCertifications from './SupervisorCertifications';
import SupervisorGradeAppeals from './SupervisorGradeAppeals';
import BatchChat from '../../../components/social/BatchChat';
import Announcements from '../Announcements/Announcements';
import UserProfileSettings from '../UserProfileSettings';

import SupervisorCalendar from './SupervisorCalendar';
import SupervisorStudentProgress from './SupervisorStudentProgress';
import styles from './SupervisorDashboard.module.css';

function SupervisorDashboard({ user, onLogout }) {
  return (
    <DashboardLayout
      topNav={
        <DashboardTopNav
          user={user}
          onLogout={onLogout}
          title="Supervisor Dashboard"
        />
      }
      sidebar={<SupervisorSidebar />}
    >
      <Routes>
        <Route index element={<SupervisorOverview user={user} />} />

        <Route
          path="create-deployment-request"
          element={<CreateDeploymentRequest />}
        />

        <Route path="students" element={<SupervisorStudents />} />

        <Route path="attendance" element={<SupervisorAttendance />} />

        <Route path="attendance-schedule" element={<SupervisorSchedule />} />

        <Route path="reports-concerns" element={<SupervisorReportsConcerns />} />

        <Route
          path="evaluate"
          element={<SupervisorEvaluateStudent />}
        />

        <Route
          path="evaluation"
          element={<SupervisorEvaluation />}
        />

        <Route
          path="certifications"
          element={<SupervisorCertifications />}
        />

        <Route
          path="grade-appeals"
          element={<SupervisorGradeAppeals />}
        />

        <Route path="announcements" element={<Announcements user={user} />} />

        <Route
          path="group-chat"
          element={<BatchChat user={user} />}
        />

        <Route
          path="profile"
          element={<UserProfileSettings />}
        />

        <Route
          path="*"
          element={<Navigate to="evaluate" replace />}
        />
      </Routes>
    </DashboardLayout>
  );
}

function SupervisorOverview({ user }) {
  return (
    <div className={styles.dashboard}>

      <div className={styles.pageHeader}>
        <div>

          <h1>
            Welcome back,
            <span>
              {' '}
              {getUserName(user)}
            </span>
          </h1>

          <p>
            Monitor your deployed students, attendance,
            and immersion progress from one place.
          </p>
        </div>
      </div>

      <div className={styles.overviewSplit}>
        <div className={styles.overviewLeft}>
          <SupervisorCalendar compact />
        </div>
        <div className={styles.overviewRight}>
          <SupervisorStudentProgress />
        </div>
      </div>

    </div>
  );
}

function getUserName(user) {
  return (
    user?.first_name ||
    user?.name ||
    user?.email ||
    'Supervisor'
  );
}

export default SupervisorDashboard;
