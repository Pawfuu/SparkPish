/**
 * Example Firebase config — safe to commit.
 *
 * Setup:
 * 1. Copy this file to shared/firebase-config.js
 * 2. Replace the placeholder values with your Firebase project settings
 *    (Firebase Console → Project settings → Your apps → Web app config)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = { // Replace with your actual Firebase project settings
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
