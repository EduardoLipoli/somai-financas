import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBExhgeuG6-eHhVuarUPfubnpRn4OPdHMs", //[cite: 6]
    authDomain: "controle-de-gastos-7e539.firebaseapp.com", //[cite: 6]
    projectId: "controle-de-gastos-7e539", //[cite: 6]
    storageBucket: "controle-de-gastos-7e539.firebasestorage.app", //[cite: 6]
    messagingSenderId: "693947952417", //[cite: 6]
    appId: "1:693947952417:web:8aac7ea3fb469947426260" //[cite: 6]
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig); //[cite: 6]
}

export const auth = firebase.auth();
export const googleProvider = new firebase.auth.GoogleAuthProvider(); //