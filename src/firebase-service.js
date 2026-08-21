import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { doc, getDoc, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, serverTimestamp, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig, hasFirebaseConfig } from './firebase-config.js';

const DATA_VERSION = 1;
let client;

export function isFirebaseConfigured() {
  return hasFirebaseConfig();
}

export function getFirebaseClient() {
  if (!isFirebaseConfigured()) return null;
  if (!client) {
    const app = initializeApp(firebaseConfig);
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
    client = { app, auth: getAuth(app), db };
  }
  return client;
}

export function onFirebaseAuthChange(callback) {
  const firebase = getFirebaseClient();
  if (!firebase) return () => {};
  return onAuthStateChanged(firebase.auth, callback);
}

export async function loginOrCreateUser(email, password) {
  const firebase = getFirebaseClient();
  if (!firebase) throw new Error('Firebase config is missing. Update src/firebase-config.js first.');
  try {
    return await signInWithEmailAndPassword(firebase.auth, email, password);
  } catch (error) {
    if (['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password'].includes(error.code)) {
      return createUserWithEmailAndPassword(firebase.auth, email, password);
    }
    throw error;
  }
}

export async function pullUserState(uid) {
  const firebase = getFirebaseClient();
  if (!firebase || !uid) return null;
  const snapshot = await getDoc(userStateRef(firebase.db, uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function pushUserState(uid, state) {
  const firebase = getFirebaseClient();
  if (!firebase || !uid) return null;
  const payload = serializeState(state);
  await setDoc(userStateRef(firebase.db, uid), payload, { merge: true });
  return payload;
}

export async function syncUserState(uid, localState) {
  const remoteState = await pullUserState(uid);
  if (remoteState && Number(remoteState.localUpdatedAt || 0) > Number(localState.sync?.localUpdatedAt || 0)) {
    return deserializeState(remoteState, localState.user);
  }
  await pushUserState(uid, localState);
  return localState;
}

function userStateRef(db, uid) {
  return doc(db, 'users', uid, 'herdData', 'state');
}

function serializeState(state) {
  return {
    version: DATA_VERSION,
    cows: state.cows || [],
    milk: state.milk || [],
    thresholds: state.thresholds || {},
    localUpdatedAt: state.sync?.localUpdatedAt || Date.now(),
    updatedAt: serverTimestamp(),
  };
}

function deserializeState(remoteState, user) {
  return {
    user,
    cows: remoteState.cows || [],
    milk: remoteState.milk || [],
    thresholds: remoteState.thresholds || { fat: 3.5, snf: 8.0 },
    sync: {
      pending: false,
      localUpdatedAt: remoteState.localUpdatedAt || Date.now(),
      lastSyncedAt: new Date().toISOString(),
    },
  };
}
