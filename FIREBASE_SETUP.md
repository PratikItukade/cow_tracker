# Firebase setup for Dairy Herd Manager

The app is a static GitHub Pages PWA, so it uses the Firebase client SDK directly from the browser.

## 1. Create Firebase resources

1. Create a Firebase project in the Firebase console.
2. Add a Web app to the project.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Create a **Cloud Firestore** database.

## 2. Add the web config

`src/firebase-config.js` is currently populated with the project config for `cowtracker-2838f`. If the Firebase project is recreated later, replace it with the new web app config:

```js
export const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  projectId: '...',
  appId: '...',
};
```

With the current config in place, the existing login form signs in/creates Firebase Auth users and the Sync button reads/writes Firestore. If placeholder values are restored, the app falls back to local-only mode.

## 3. Suggested Firestore rules

The app stores one document per user at `users/{uid}/herdData/state`. Use rules like:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/herdData/state {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 4. GitHub Pages note

Keep all app asset paths relative (`./...`) because the production URL is deployed under `/cow_tracker/`.
