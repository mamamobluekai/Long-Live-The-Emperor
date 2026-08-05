import { Link } from 'react-router-dom';
import styles from './ErrorPage.module.css';

export default function ErrorPage({ title = 'Something went wrong', message, backTo = '/dashboard/admin' }) {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>!</div>
        <h1 className={styles.title}>{title}</h1>
        {message ? <p className={styles.message}>{message}</p> : null}
        <Link to={backTo} className={styles.homeBtn}>Go to Dashboard</Link>
      </div>
    </div>
  );
}
