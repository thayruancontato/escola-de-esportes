import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyDE3mvj0tj9VWUK5vDgmx3ZJ5ZSjW_RLZA",
    authDomain: "cadastro-uba.firebaseapp.com",
    projectId: "cadastro-uba",
    storageBucket: "cadastro-uba.firebasestorage.app",
    messagingSenderId: "802279556244",
    appId: "1:802279556244:web:a141b5ee25b22215afe081",
    measurementId: "G-TPDJ6Q6VKT"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
