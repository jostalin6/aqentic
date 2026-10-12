import { createRequire } from 'node:module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
import { readFileSync } from 'node:fs';
initializeApp({credential:applicationDefault()});
const db=getFirestore();
// Extract the curated example catalog from a generated JSON file, never execute TS.
const products=JSON.parse(readFileSync(new URL('../catalog.seed.json',import.meta.url),'utf8').replace(/^\uFEFF/, ''));
const batch=db.batch();
for(const {id,...product} of products) batch.set(db.doc(`products/${id}`),product);
await batch.commit();
console.log(`Seeded ${products.length} products.`);

