// Firebase web app config for the GitHub Pages PWA.
// Firebase apiKey values are public client identifiers; access is controlled by Auth and Firestore rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyDBNPjlVvklJ4KQ7xum6YHkRMCWD3amr8I',
  authDomain: 'cowtracker-2838f.firebaseapp.com',
  projectId: 'cowtracker-2838f',
  storageBucket: 'cowtracker-2838f.firebasestorage.app',
  messagingSenderId: '834310705612',
  appId: '1:834310705612:web:d9e16128d91e61127a4d69',
  measurementId: 'G-EXB7HWYSXY',
};

export function hasFirebaseConfig(config = firebaseConfig) {
  return Boolean(
    config.apiKey &&
    config.authDomain &&
    config.projectId &&
    config.appId &&
    !Object.values(config).some((value) => String(value).startsWith('REPLACE_WITH_'))
  );
}
