import { BookOpen, CircleHelp, Download, MapPin, Smartphone } from 'lucide-react';
import styles from './Guide.module.css';
import step1Image from '../../../assets/Step1_web_to_app.jpg';
import step2Image from '../../../assets/Step2_web_to_app.jpg';
import step3Image from '../../../assets/Step3_web_to_app.jpg';
import locationMenuImage from '../../../assets/permission.jpg';
import siteControlsImage from '../../../assets/sitecontrol.jpg';
import locationPermissionImage from '../../../assets/location.jpg';

const steps = [
  {
    number: 1,
    title: 'Open your website',
    instructions: [
      'Open Google Chrome on your phone.',
      "Visit your school's website or web system.",
      'Wait for the page to load completely.',
    ],
  },
  {
    number: 2,
    title: 'Tap the three-dot menu (⋮)',
    instructions: [
      'Look at the top-right corner of Chrome.',
      'Tap the three vertical dots (⋮).',
      'A menu will appear on your screen.',
    ],
    image: step1Image,
    imageAlt: 'Google Chrome open on the school website, with the three-dot menu in the top-right',
  },
  {
    number: 3,
    title: 'Select “Install app” or “Add to Home screen”',
    instructions: [
      'Look through the menu options.',
      'If you see Install app, tap it.',
      'If that option is unavailable, look for Add to Home screen and tap it instead.',
      'The option depends on whether the website supports installation as a web app.',
    ],
    image: step2Image,
    imageAlt: 'Chrome prompt showing install and create shortcut options',
  },
  {
    number: 4,
    title: 'Confirm the installation',
    instructions: [
      'If you selected Install app, wait for the confirmation window, tap Install, and wait for the installation to finish.',
      'If you selected Add to Home screen, check the website’s name and tap Add. Confirm if Chrome asks you to do so.',
    ],
    image: step3Image,
    imageAlt: 'Chrome menu showing the install and create shortcut option',
  },
  {
    number: 5,
    title: 'Find the app on your home screen',
    instructions: [
      'Return to your phone’s home screen.',
      'Look for the new website icon.',
      'Tap the icon to open your website.',
      'You can now access your website without typing its URL every time.',
    ],
  },
  {
    number: 6,
    title: 'Test the app',
    instructions: [
      'Open the new icon.',
      'Check whether the website loads correctly.',
      'Sign in using your account if required.',
      'Navigate through the website to confirm that its features work.',
    ],
  },
];

const locationSteps = [
  {
    number: 1,
    title: 'Open your Work Immersion website',
    instructions: [
      'Open the Work Immersion website in Google Chrome on your Android phone.',
    ],
  },
  {
    number: 2,
    title: 'Open Chrome’s site controls',
    instructions: [
      'Tap the three dots (⋮) in the upper-right corner of Chrome.',
      'You can also tap the icon beside the website address to open site controls.',
    ],
    image: locationMenuImage,
    imageAlt: 'Chrome menu with Site controls highlighted',
  },
  {
    number: 3,
    title: 'Open the website permissions',
    instructions: [
      'Select Site settings from the menu, or tap Permissions in the site controls panel.',
    ],
    image: siteControlsImage,
    imageAlt: 'Chrome site controls panel showing the Permissions option',
  },
  {
    number: 4,
    title: 'Allow location access',
    instructions: [
      'Tap Location.',
      'Select Allow and enable precise location if Chrome shows that option.',
    ],
    image: locationPermissionImage,
    imageAlt: 'Chrome Permissions screen showing the Location permission',
  },
  {
    number: 5,
    title: 'Turn on your phone’s location',
    instructions: [
      'Turn on Location in your phone’s Android Settings.',
      'Enable Google Location Accuracy in Settings, if available.',
      'Open Google Maps to check that your location can be found.',
      'Return to the Work Immersion website and refresh the page.',
    ],
  },
];

function Guide() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerIcon} aria-hidden="true">
          <BookOpen size={24} />
        </div>
        <div>
          <p className={styles.eyebrow}>Student Guide</p>
          <h1>Turn the website into an app</h1>
          <p className={styles.intro}>
            Follow this step-by-step guide to add the school website to your
            Android phone using Google Chrome.
          </p>
        </div>
      </header>

      <section className={styles.guideCard} aria-labelledby="guide-title">
        <div className={styles.guideTitle}>
          <div className={styles.guideTitleIcon} aria-hidden="true">
            <Smartphone size={21} />
          </div>
          <div>
            <h2 id="guide-title">Install or add the website to your home screen</h2>
            <p>For students using Android phones</p>
          </div>
        </div>

        <ol className={styles.stepList}>
          {steps.map((step) => (
            <li
              className={`${styles.step} ${step.image ? '' : styles.stepTextOnly}`}
              key={step.number}
            >
              <div className={styles.stepContent}>
                <span className={styles.stepNumber}>Step {step.number}</span>
                <h3>{step.title}</h3>
                <ol className={styles.instructions}>
                  {step.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>
              {step.image && (
                <figure className={styles.stepFigure}>
                  <img src={step.image} alt={step.imageAlt} loading="lazy" />
                </figure>
              )}
            </li>
          ))}
        </ol>

        <aside className={styles.troubleshooting} aria-labelledby="troubleshooting-title">
          <div className={styles.troubleshootingIcon} aria-hidden="true">
            <CircleHelp size={21} />
          </div>
          <div>
            <h2 id="troubleshooting-title">Troubleshooting</h2>
            <h3>What if “Install app” does not appear?</h3>
            <ul>
              <li>Try Add to Home screen instead.</li>
              <li>Make sure you are using Google Chrome.</li>
              <li>Check that the website uses HTTPS.</li>
              <li>
                If neither option is available, contact the website developer
                to check whether the website supports installation.
              </li>
            </ul>
          </div>
        </aside>

        <aside className={styles.note}>
          <Download size={19} aria-hidden="true" />
          <p>
            <strong>Important:</strong> Adding a shortcut and installing a web
            app are not exactly the same. A shortcut may open the website in
            Chrome, while a properly configured Progressive Web App (PWA) can
            open in a more app-like window.
          </p>
        </aside>
      </section>

      <section className={styles.guideCard} aria-labelledby="location-guide-title">
        <div className={styles.guideTitle}>
          <div className={styles.guideTitleIcon} aria-hidden="true">
            <MapPin size={21} />
          </div>
          <div>
            <h2 id="location-guide-title">Enable location in Chrome</h2>
            <p>Allow the website to use your location for attendance</p>
          </div>
        </div>

        <ol className={styles.stepList}>
          {locationSteps.map((step) => (
            <li
              className={`${styles.step} ${step.image ? '' : styles.stepTextOnly}`}
              key={step.number}
            >
              <div className={styles.stepContent}>
                <span className={styles.stepNumber}>Step {step.number}</span>
                <h3>{step.title}</h3>
                <ol className={styles.instructions}>
                  {step.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ol>
              </div>
              {step.image && (
                <figure className={styles.stepFigure}>
                  <img src={step.image} alt={step.imageAlt} loading="lazy" />
                </figure>
              )}
            </li>
          ))}
        </ol>

        <aside className={styles.note}>
          <MapPin size={19} aria-hidden="true" />
          <p>
            <strong>Tip:</strong> Chrome and Android menu names can vary by
            phone model and version. If you cannot find a setting, look for
            Location under the website’s permissions or your phone’s Settings.
          </p>
        </aside>
      </section>
    </main>
  );
}

export default Guide;
