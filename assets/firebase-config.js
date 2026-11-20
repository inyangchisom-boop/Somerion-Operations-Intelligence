// Use credentials from the NEW Firebase project created only for Somerion Operations Intelligence.
// Never put service-account private keys or Admin SDK credentials in browser code.
export const firebaseConfig = {
  apiKey: "AIzaSyB_QxH2CHC6c5_cpmEErjX_V7B_JCxEulk",
  authDomain: "somerion-oi.firebaseapp.com",
  projectId: "somerion-oi",
  storageBucket: "somerion-oi.firebasestorage.app",
  messagingSenderId: "704765469495",
  appId: "1:704765469495:web:092e16342badfb93da70b2",
  measurementId: "G-F35996LTR8"
};
export const configured = Object.values(firebaseConfig).every(v => typeof v === "string" && v.length > 0 && !v.startsWith("REPLACE_WITH_"));
