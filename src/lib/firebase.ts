import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const app = initializeApp(config);

// Pass the specific databaseId since it might not be the default "(default)"
export const db = getFirestore(app, config.firestoreDatabaseId);
