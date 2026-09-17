const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS ? fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS) : '{}');

// Note: I can't easily authenticate firebase-admin without the service account JSON.
