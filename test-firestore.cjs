const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  projectId: "ai-studio-projetotsunami-cbc3f9d1-90fa-45f7-aa34-3e45e28cdd3f"
});

const db = getFirestore();
db.collection('activity_logs').orderBy('timestamp', 'desc').limit(5).get().then(snapshot => {
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
}).catch(console.error);
