import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, orderBy, query, limit } from 'firebase/firestore';

const app = initializeApp({
  projectId: "ai-studio-projetotsunami-cbc3f9d1-90fa-45f7-aa34-3e45e28cdd3f"
});

const db = getFirestore(app);
getDocs(query(collection(db, 'activity_logs'), orderBy('timestamp', 'desc'), limit(5))).then(snapshot => {
  snapshot.forEach(doc => {
    console.log(doc.id, '=>', doc.data());
  });
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
