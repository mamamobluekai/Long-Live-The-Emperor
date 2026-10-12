import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BellRing,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarCheck2,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import styles from './About.module.css';
const emmersionLogo = '/logo.png';

const features = [
  {
    icon: CalendarCheck2,
    title: 'Attendance Monitoring',
    description: 'Organize and monitor student attendance throughout the immersion period.',
  },
  {
    icon: ClipboardCheck,
    title: 'Requirements Management',
    description: 'Keep track of submitted, pending, and approved student requirements.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Student Deployment',
    description: 'Organize student placements, assignments, and immersion schedules.',
  },
  {
    icon: BookOpenCheck,
    title: 'Progress Tracking',
    description: 'Follow students’ immersion progress and completion status.',
  },
  {
    icon: Award,
    title: 'Performance Evaluation',
    description: 'Support the evaluation of students’ performance during work immersion.',
  },
  {
    icon: BellRing,
    title: 'Notifications and Updates',
    description: 'Stay informed about important activities, reminders, and status changes.',
  },
];

const roles = [
  {
    icon: GraduationCap,
    title: 'Students',
    description: 'Monitor personal progress, attendance, and requirements.',
  },
  {
    icon: BookOpenCheck,
    title: 'Teachers',
    description: 'Guide students and review their submitted work.',
  },
  {
    icon: ClipboardCheck,
    title: 'Immersion Coordinators',
    description: 'Organize and monitor work immersion activities.',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Workplace Supervisors',
    description: 'Support and evaluate students during their placement.',
  },
  {
    icon: ShieldCheck,
    title: 'Administrators',
    description: 'Manage system users and oversee relevant records.',
  },
];

const dashboardPaths = {
  admin: '/dashboard/admin/dashboard',
  coordinator: '/dashboard/coordinator',
  teacher: '/dashboard/teacher/overview',
  student: '/dashboard/student/overview',
  supervisor: '/dashboard/supervisor',
};

function About({ user }) {
  const navigate = useNavigate();
  const dashboardPath = dashboardPaths[user?.role] || '/dashboard';

  const scrollToFeatures = () => {
    const section = document.getElementById('about-features');
    if (!section) return;

    section.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>About e-mmersion</p>
          <h1 id="about-title">Making Work Immersion Easier, Smarter, and More Organized</h1>
          <p className={styles.heroDescription}>
            e-mmersion is a digital monitoring system designed to simplify the
            management of the Grade 12 Work Immersion Program. It brings
            students, teachers, coordinators, and workplace supervisors
            together in one platform to help organize requirements, monitor
            progress, and improve communication throughout the immersion journey.
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={scrollToFeatures}
          >
            Explore Features <ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.visualAccent} aria-hidden="true" />
          <img src={emmersionLogo} alt="e-mmersion logo" />
          <span>Connecting learning to real-world experience</span>
        </div>
      </section>

      <section className={styles.aboutSection} aria-labelledby="system-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>The System</p>
          <h2 id="system-title">A Better Way to Manage Work Immersion</h2>
        </div>
        <div className={styles.systemContent}>
          <p>
            e-mmersion provides a centralized digital environment for managing
            important work immersion activities. It helps organize student
            records, track requirements, monitor attendance, and keep the people
            involved informed throughout the program.
          </p>
          <div className={styles.systemCallout}>
            <UsersRound size={25} aria-hidden="true" />
            <p>
              One shared platform for the school community and workplace
              partners supporting every immersion journey.
            </p>
          </div>
        </div>
      </section>

      <section
        id="about-features"
        className={styles.featuresSection}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>What You Can Do</p>
          <h2 id="features-title">Everything in One Place</h2>
          <p>Tools to help each part of the immersion program stay organized.</p>
        </div>
        <div className={styles.featureGrid}>
          {features.map(({ icon: Icon, title, description }) => (
            <article className={styles.featureCard} key={title}>
              <span className={styles.cardIcon}>
                <Icon size={21} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.rolesSection} aria-labelledby="roles-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Our Community</p>
          <h2 id="roles-title">Built for Everyone Involved</h2>
        </div>
        <div className={styles.roleGrid}>
          {roles.map(({ icon: Icon, title, description }) => (
            <article className={styles.roleCard} key={title}>
              <Icon size={22} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.valuesGrid} aria-label="Our mission and vision">
        <article className={styles.valueCard}>
          <p className={styles.eyebrow}>Our Mission</p>
          <p>
            To provide a user-friendly digital platform that helps organize
            work immersion activities, improve monitoring and communication,
            and support students in completing their program requirements.
          </p>
        </article>
        <article className={`${styles.valueCard} ${styles.visionCard}`}>
          <p className={styles.eyebrow}>Our Vision</p>
          <p>
            To promote a more organized, connected, and efficient work
            immersion experience through technology and stronger collaboration
            between the school and workplace partners.
          </p>
        </article>
      </section>

      <section className={styles.closingCta} aria-labelledby="closing-title">
        <div>
          <p className={styles.eyebrow}>Your Next Step</p>
          <h2 id="closing-title">Your Work Immersion Journey, Made More Organized</h2>
          <p>
            Stay on track, keep your requirements organized, and make every
            step of your work immersion experience count.
          </p>
        </div>
        <button
          type="button"
          className={styles.ctaButton}
          onClick={() => navigate(dashboardPath)}
        >
          Go to Dashboard <ArrowRight size={17} aria-hidden="true" />
        </button>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <img src={emmersionLogo} alt="e-mmersion logo" />
          <div>
            <strong>e-mmersion</strong>
            <span>Connecting Learning to Real-World Experience.</span>
          </div>
        </div>
        <p>Marinduque National High School</p>
        <p>© {new Date().getFullYear()} e-mmersion</p>
      </footer>
    </main>
  );
}

export default About;
