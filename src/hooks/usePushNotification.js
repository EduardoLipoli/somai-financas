import { useEffect, useState, useCallback } from "react";
import firebase from "firebase/compat/app";
 
// ── CHAVE PÚBLICA VAPID ───────────────────────────────────────────────────────
// Gere suas chaves em: https://web-push-codelab.glitch.me/
// ou via CLI: npx web-push generate-vapid-keys
// Cole a PUBLIC KEY abaixo:
const VAPID_PUBLIC_KEY = "BCd3JYyTHsUxzCOKju66gqbjplyZjXkdoqEEJqmpCqfr5tsnBPrw0do6BG8kKMUI2heYvIJ7QqJYkh2miZ0-DXQ";
 
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
 
export function usePushNotification(uid) {
  const [permission, setPermission] = useState(Notification.permission);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [swReady, setSwReady] = useState(false);
 
  // ── Registra Service Worker ──────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
 
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        setSwReady(true);
        // Verifica se já está inscrito
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        if (sub) setIsSubscribed(true);
      })
      .catch(console.error);
  }, []);
 
  // ── Pede permissão + cria subscription ──────────────────────────────────
  const subscribe = useCallback(async () => {
    if (!uid || !swReady) return false;
 
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;
 
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
 
      // Salva no Firestore para o backend usar
      const db = firebase.firestore();
      await db
        .collection("users")
        .doc(uid)
        .collection("pushSubscriptions")
        .doc("default")
        .set({
          subscription: JSON.parse(JSON.stringify(sub)),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          userAgent: navigator.userAgent,
        });
 
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Erro ao assinar push:", err);
      return false;
    }
  }, [uid, swReady]);
 
  // ── Cancela subscription ─────────────────────────────────────────────────
  const unsubscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
 
    if (uid) {
      const db = firebase.firestore();
      await db
        .collection("users")
        .doc(uid)
        .collection("pushSubscriptions")
        .doc("default")
        .delete();
    }
    setIsSubscribed(false);
  }, [uid]);
 
  // ── Notificação LOCAL imediata (sem backend, app aberto/background) ───────
  const notifyLocal = useCallback((title, body, url = "/despesas") => {
    if (permission !== "granted") return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, {
        body,
        icon: "/icon-192.png",
        tag: "finapp-local",
        renotify: true,
        data: { url },
        vibrate: [200, 100, 200],
      });
    });
  }, [permission]);
 
  return {
    permission,       // 'granted' | 'denied' | 'default'
    isSubscribed,     // boolean
    swReady,          // boolean
    subscribe,        // fn async → boolean
    unsubscribe,      // fn async
    notifyLocal,      // fn(title, body, url?)
  };
}