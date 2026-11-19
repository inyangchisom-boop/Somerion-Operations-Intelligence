// Use credentials from a NEW Firebase project created only for Somerion Operations Intelligence.
// Never put service-account private keys or Admin SDK credentials in browser code.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_NEW_PROJECT_API_KEY",
  authDomain: "REPLACE_WITH_NEW_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_NEW_PROJECT_ID",
  storageBucket: "REPLACE_WITH_NEW_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_NEW_PROJECT_SENDER_ID",
  appId: "REPLACE_WITH_NEW_PROJECT_APP_ID"
};
export const configured = Object.values(firebaseConfig).every(v => typeof v === "string" && v.length > 0 && !v.startsWith("REPLACE_WITH_"));