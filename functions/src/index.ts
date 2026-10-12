import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import Stripe from 'stripe';
initializeApp();
const db = getFirestore();
const stripeKey = defineSecret('STRIPE_SECRET_KEY');
const webhookKey = defineSecret('STRIPE_WEBHOOK_SECRET');
const appUrl = defineString('APP_URL');
const priceId = defineString('STRIPE_SUPPORTER_PRICE_ID');
const callable = { region: 'asia-south1', enforceAppCheck: true, maxInstances: 30, secrets: [stripeKey] };
function origin() {
 const url = new URL(appUrl.value());
 if (url.protocol !== 'https:') throw new HttpsError('failed-precondition', 'APP_URL must use HTTPS.');
 return url.origin;
}
export const createCheckout = onCall(callable, async request => {
 if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
 const { kind, amount } = request.data || {};
 if (!['subscription', 'donation'].includes(kind) || (kind === 'donation' && ![5,10,25].includes(amount))) throw new HttpsError('invalid-argument', 'Invalid contribution.');
 const uid = request.auth.uid;
 // Bound each account to one checkout request per minute; no shared hot document.
 const rateRef = db.doc(`checkoutLimits/${uid}`);
 await db.runTransaction(async tx => {
  const snapshot = await tx.get(rateRef);
  if (snapshot.exists && Date.now() - snapshot.data()!.lastRequest < 60_000) throw new HttpsError('resource-exhausted', 'Please wait a minute before trying again.');
  tx.set(rateRef, { lastRequest: Date.now() });
 });
 const stripe = new Stripe(stripeKey.value());
 const account = await db.doc(`users/${uid}/billing/account`).get();
 const customer = account.data()?.customerId ? { id: account.data()!.customerId as string } : await stripe.customers.create({ metadata: { uid } }, { idempotencyKey: `customer-${uid}` });
 if (kind === 'subscription') {
  const subscriptions = await stripe.subscriptions.list({customer:customer.id,status:'all',limit:100});
  if (subscriptions.data.some(s => ['active','trialing','past_due','unpaid','incomplete','paused'].includes(s.status))) throw new HttpsError('already-exists', 'Manage your existing membership in the billing portal.');
 }
 await db.doc(`users/${uid}/billing/account`).set({ customerId: customer.id }, { merge: true });
 const base = origin();
 const session = await stripe.checkout.sessions.create({
  customer: customer.id, mode: kind === 'subscription' ? 'subscription' : 'payment',
  line_items: kind === 'subscription' ? [{price:priceId.value(),quantity:1}] : [{price_data:{currency:'usd',product_data:{name:'Support Aqentic'},unit_amount:amount*100},quantity:1}],
  metadata: { uid, kind }, ...(kind === 'subscription' ? {subscription_data:{metadata:{uid}}} : {}),
  success_url: `${base}/?checkout=success`, cancel_url: `${base}/?checkout=cancelled`,
 });
 if (!session.url) throw new HttpsError('internal', 'Checkout could not be created.');
 return { url: session.url };
});
export const billingPortal = onCall(callable, async request => {
 if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
 const snapshot = await db.doc(`users/${request.auth.uid}/billing/account`).get();
 const customerId = snapshot.data()?.customerId;
 if (!customerId) throw new HttpsError('not-found', 'No billing account.');
 return {url:(await new Stripe(stripeKey.value()).billingPortal.sessions.create({customer:customerId,return_url:origin()})).url};
});
export const stripeWebhook = onRequest({region:'asia-south1',secrets:[stripeKey,webhookKey],maxInstances:30}, async (req,res) => {
 if (req.method !== 'POST') {res.status(405).send('Method not allowed');return;}
 const stripe = new Stripe(stripeKey.value());
 let event: Stripe.Event;
 try { event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'] as string, webhookKey.value()); }
 catch {res.status(400).send('Invalid signature');return;}
 try {
  // Retrieve current subscription state so delayed events cannot restore old access.
  let subscription: Stripe.Subscription | undefined;
  if (event.type.startsWith('customer.subscription.')) {
   const incoming = event.data.object as Stripe.Subscription;
   subscription = await stripe.subscriptions.retrieve(incoming.id);
  }
  await db.runTransaction(async tx => {
   const eventRef=db.doc(`billingEvents/${event.id}`);
   if((await tx.get(eventRef)).exists)return;
   if(subscription?.metadata.uid){
    const uid=subscription.metadata.uid;
    tx.set(db.doc(`users/${uid}/subscriptions/${subscription.id}`),{status:subscription.status,subscriptionId:subscription.id,updatedAt:FieldValue.serverTimestamp()});
    // Billing state is informational; SaaS entitlements must be checked server-side.
   }
   if(event.type==='checkout.session.completed'){
    const session=event.data.object as Stripe.Checkout.Session;
    if(session.metadata?.uid && session.metadata.kind==='donation' && session.payment_status==='paid') tx.set(db.doc(`donations/${session.id}`),{uid:session.metadata.uid,amount:session.amount_total,currency:session.currency,createdAt:FieldValue.serverTimestamp()});
   }
   tx.create(eventRef,{type:event.type,processedAt:FieldValue.serverTimestamp()});
  });
  res.status(200).send('OK');
 } catch {res.status(500).send('Processing failed; retry later');}
});

