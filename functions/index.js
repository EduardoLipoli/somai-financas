const functions = require("firebase-functions");
const admin = require("firebase-admin");
const webpush = require("web-push");

admin.initializeApp();

// Configura VAPID com as chaves do Firebase config
webpush.setVapidDetails(
  functions.config().vapid.email,
  functions.config().vapid.public,
  functions.config().vapid.private,
);

// ── Função agendada: roda todo dia às 08:00 ──────────────────────────────────
exports.notificarDespesas = functions.pubsub
  .schedule("0 8 * * *") // todo dia às 08:00
  .timeZone("America/Sao_Paulo")
  .onRun(async () => {
    const db = admin.firestore();
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em5dias = new Date(hoje);
    em5dias.setDate(em5dias.getDate() + 5);

    // Percorre todos os usuários
    const usersSnap = await db.collection("users").get();

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;

      // Busca subscriptions do dispositivo
      const subsSnap = await db
        .collection("users")
        .doc(uid)
        .collection("pushSubscriptions")
        .get();

      if (subsSnap.empty) continue;

      // Busca transações de gastos
      const txSnap = await db
        .collection("users")
        .doc(uid)
        .collection("transactions")
        .where("type", "==", "Gasto")
        .get();

      let atrasadas = 0;
      let vencendo = 0;

      const agora = new Date();
      const monthKey = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

      txSnap.forEach((doc) => {
        const data = doc.data();
        const due = data.dueDate?.toDate?.() || new Date(data.dueDate);
        const isPaid = data.overrides?.[monthKey]?.isPaid ?? false;

        if (!isPaid) {
          if (due < hoje) atrasadas++;
          else if (due >= hoje && due <= em5dias) vencendo++;
        }
      });

      if (atrasadas === 0 && vencendo === 0) continue;

      const msgs = [];
      if (atrasadas > 0) msgs.push(`${atrasadas} atrasada(s)`);
      if (vencendo > 0) msgs.push(`${vencendo} vence(m) em 5 dias`);

      const payload = JSON.stringify({
        title: "💸 Alerta de Despesas",
        body: msgs.join(" • "),
        icon: "/icon-192.png",
        data: { url: "/despesas" },
      });

      // Envia para cada dispositivo inscrito
      for (const subDoc of subsSnap.docs) {
        const sub = subDoc.data().subscription;
        try {
          await webpush.sendNotification(sub, payload);
        } catch (err) {
          // Subscription expirou — remove
          if (err.statusCode === 410) {
            await subDoc.ref.delete();
          }
        }
      }
    }
  });

// ── Função HTTP: envio manual (para testes) ───────────────────────────────────
exports.enviarNotificacaoManual = functions.https.onCall(
  async (data, context) => {
    if (!context.auth)
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Login necessário",
      );

    const uid = context.auth.uid;
    const { title = "Teste", body = "Notificação de teste!" } = data;

    const db = admin.firestore();
    const subsSnap = await db
      .collection("users")
      .doc(uid)
      .collection("pushSubscriptions")
      .get();

    for (const subDoc of subsSnap.docs) {
      const sub = subDoc.data().subscription;
      await webpush.sendNotification(
        sub,
        JSON.stringify({ title, body, icon: "/icon-192.png" }),
      );
    }

    return { ok: true, sent: subsSnap.size };
  },
);
