import SocialFeed from './SocialFeed';
import styles from './Overview.module.css';

function Overview({ user }) {
  const firstName = user?.first_name || 'Student';

  // Replace these with your actual API/database values later
  const progress = 33;
  const completedDays = 3;
  const totalDays = 10;

  return (
    <div className={styles.dashboard}>

      {/* =========================
          GREETING
      ========================= */}
      <section className={styles.greeting}>
        <div>
          <p className={styles.eyebrow}>WORK IMMERSION</p>

          <h2>
            Welcome back, {firstName}! 👋
          </h2>

          <p className={styles.greetingText}>
            Here's an overview of your work immersion progress and activities.
          </p>
        </div>

        <div className={styles.greetingDate}>
          <span>Today</span>
          <strong>
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </strong>
        </div>
      </section>


      {/* =========================
          MAIN LAYOUT
      ========================= */}
      <div className={styles.mainGrid}>

        {/* LEFT SIDE */}
        <main className={styles.leftColumn}>

          {/* =========================
              OVERALL PROGRESS
          ========================= */}
          <section className={styles.progressCard}>

            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.cardEyebrow}>
                  IMMERSION PROGRESS
                </p>

                <h3>Overall Progress</h3>

                <p>
                  Keep completing your requirements and attendance
                  to finish your immersion.
                </p>
              </div>

              <div className={styles.progressCircle}>
                <svg viewBox="0 0 100 100">
                  <circle
                    className={styles.progressBackground}
                    cx="50"
                    cy="50"
                    r="42"
                  />

                  <circle
                    className={styles.progressValue}
                    cx="50"
                    cy="50"
                    r="42"
                    style={{
                      strokeDashoffset: 264 - (264 * progress) / 100,
                    }}
                  />
                </svg>

                <span>{progress}%</span>
              </div>
            </div>

            <div className={styles.progressBar}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className={styles.progressStats}>
              <div>
                <strong>{completedDays}</strong>
                <span>Days Completed</span>
              </div>

              <div>
                <strong>{totalDays}</strong>
                <span>Total Days</span>
              </div>

              <div>
                <strong>{totalDays - completedDays}</strong>
                <span>Days Remaining</span>
              </div>
            </div>

          </section>


          {/* =========================
              TODAY'S ATTENDANCE
          ========================= */}
          <section className={styles.attendanceCard}>

            <div className={styles.sectionTitle}>
              <div className={styles.titleIcon}>📅</div>

              <div>
                <h3>Today's Attendance</h3>
                <p>Your attendance status for today</p>
              </div>
            </div>

            <div className={styles.attendanceGrid}>

              <div className={styles.attendanceItem}>
                <span className={styles.attendanceLabel}>
                  Morning
                </span>

                <strong className={styles.time}>
                  8:12 AM
                </strong>

                <span className={`${styles.status} ${styles.present}`}>
                  ● Present
                </span>
              </div>

              <div className={styles.attendanceDivider} />

              <div className={styles.attendanceItem}>
                <span className={styles.attendanceLabel}>
                  Afternoon
                </span>

                <strong className={styles.time}>
                  —
                </strong>

                <span className={`${styles.status} ${styles.pending}`}>
                  ● Not yet timed in
                </span>
              </div>

            </div>

            <a
              href="/dashboard/student/attendance"
              className={styles.viewButton}
            >
              View Attendance →
            </a>

          </section>


          {/* =========================
              RECENT ACTIVITY
          ========================= */}
          <section className={styles.activityCard}>

            <div className={styles.sectionHeaderSimple}>
              <div>
                <p className={styles.cardEyebrow}>
                  ACTIVITY
                </p>

                <h3>Recent Activity</h3>
              </div>

              <a
                href="/dashboard/student/progress"
                className={styles.viewAll}
              >
                View all
              </a>
            </div>

            <div className={styles.activityList}>

              <div className={styles.activityItem}>
                <div className={`${styles.activityIcon} ${styles.success}`}>
                  ✓
                </div>

                <div>
                  <strong>
                    Requirements approved
                  </strong>

                  <p>
                    Your immersion requirements were approved by the
                    coordinator.
                  </p>

                  <span>Today, 9:30 AM</span>
                </div>
              </div>


              <div className={styles.activityItem}>
                <div className={`${styles.activityIcon} ${styles.info}`}>
                  ↑
                </div>

                <div>
                  <strong>
                    Attendance recorded
                  </strong>

                  <p>
                    Morning attendance was successfully recorded.
                  </p>

                  <span>Today, 8:12 AM</span>
                </div>
              </div>


              <div className={styles.activityItem}>
                <div className={`${styles.activityIcon} ${styles.warning}`}>
                  !
                </div>

                <div>
                  <strong>
                    Documentation pending
                  </strong>

                  <p>
                    You still have documents that need to be submitted.
                  </p>

                  <span>Yesterday</span>
                </div>
              </div>

            </div>

          </section>

        </main>


        {/* =========================
            RIGHT SIDE
        ========================= */}
        <aside className={styles.rightColumn}>

          <div className={styles.feedHeader}>
            <div>
              <p className={styles.cardEyebrow}>
                COMMUNITY
              </p>

              <h3>News Feed</h3>
            </div>
          </div>

          <SocialFeed embedded />

        </aside>

      </div>

    </div>
  );
}

export default Overview;