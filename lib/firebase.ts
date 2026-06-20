import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDvpR0M5uK2h0E9JTyr6yOpBNSjyMD5DBA",
  authDomain: "travell-f6077-6d4e5.firebaseapp.com",
  projectId: "travell-f6077-6d4e5",
  storageBucket: "travell-f6077-6d4e5.firebasestorage.app",
  messagingSenderId: "768348618429",
  appId: "1:768348618429:web:069cf7daa2029cd03101d4",
  measurementId: "G-Q7DL08WYP9"
};

// Ensure SSR compilation safety and singleton patterns
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

export { app, auth, db }



