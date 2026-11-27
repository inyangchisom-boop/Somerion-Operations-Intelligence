// Isolated Firebase Web App configuration for the Netlify testing environment.
// This file contains browser-safe Firebase config only; never add service-account keys here.
export const firebaseConfig = {
  apiKey: "AIzaSyDSBQxZrat7oKW78E6QGPEJkHPyb-PHLdo",
  authDomain: "somerion-oi-testing.firebaseapp.com",
  projectId: "somerion-oi-testing",
  storageBucket: "somerion-oi-testing.firebasestorage.app",
  messagingSenderId: "1083937341232",
  appId: "1:1083937341232:web:a718ee43fad0680b8352f5"
};
export const configured = Object.values(firebaseConfig).every(v => typeof v === "string" && v.length > 0 && !v.startsWith("REPLACE_WITH_"));
