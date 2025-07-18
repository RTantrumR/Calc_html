import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getDatabase, ref, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAUJrPgSfsm1lWI5WDVzQNZjnquKXakdFA",
  authDomain: "calc-d9970.firebaseapp.com",
  projectId: "calc-d9970",
  storageBucket: "calc-d9970.firebasestorage.app",
  messagingSenderId: "32770443807",
  appId: "1:32770443807:web:feb7eb3261e632c270632a",
  measurementId: "G-502NVPNL4M"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export const auth = getAuth(app);

signInAnonymously(auth).catch((error) => {
    console.error("Помилка анонімної автентифікації:", error);
});

export function incrementCounter(counterName) {
    const counterRef = ref(database, 'clicks/' + counterName);
    runTransaction(counterRef, (currentValue) => {
        return (currentValue || 0) + 1;
    });
}