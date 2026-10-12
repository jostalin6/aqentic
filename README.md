# Aqentic

React + TypeScript + Vite SaaS discovery marketplace with Firebase Auth, Firestore, Hosting, App Check, and Cloud Functions. Explore free/freemium/subscription tools, filter/search, save a collection, and optionally support the platform through Stripe subscriptions or donations.

## Run locally

1. `npm install`
2. `npm run dev`
3. Open the URL Vite prints. Without `.env`, the app runs with an example catalog and browser-local bookmarks. Sign-in and payments explicitly require configuration.

## Connect Firebase

1. Create a Firebase project; register a web app. Copy `.env.example` to `.env` and fill the web config. These values identify your app; access is controlled by rules, not by hiding the web API key.
2. Enable Google authentication and authorize your development and production domains.
3. Create Firestore in a region appropriate to your audience; the functions default to Mumbai (`asia-south1`). Choose database location carefully before creation.
4. Configure App Check with reCAPTCHA Enterprise and add its site key. Monitor valid traffic before enforcing App Check on Firestore. Callable functions already enforce it.
5. Install the Firebase CLI (`npm install -g firebase-tools`), then `firebase login` and `firebase use --add` to select your project.
6. `npm --prefix functions install`
7. Populate products with Admin SDK credentials (Application Default Credentials): `node scripts/seed.mjs`. This script resolves the Admin SDK from the installed `functions` dependencies. Never put admin credentials in the frontend.
8. `npm run build` and `firebase deploy`. Functions require a billing-enabled project. No Firebase project is created or deployed by this scaffold.

## Payments

Stripe is the example payment adapter. Confirm provider availability for your business and country before launch; adapt to an eligible provider if necessary. The default supporter membership is USD 5/month, separate from provider SaaS subscriptions. The configured Stripe Price must match the UI price. Donations are USD 5/10/25. No live money is collected without your account configuration.

Copy `functions/.env.example` to `functions/.env`; set your HTTPS app origin and recurring Price ID. Set server secrets through `firebase functions:secrets:set STRIPE_SECRET_KEY` and `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`. Enable Stripe's customer billing portal. Register the deployed `stripeWebhook` URL for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`. The raw body signature is checked and event IDs are deduplicated. Subscription state is informational, never a client-writable entitlement. Test in Stripe test mode before live mode.

## Scope

This is a starter for a directory and platform-support revenue model. It links to third-party tools; it does not resell their subscriptions or host every SaaS tool. Seller onboarding, commissions/payouts, moderation, tax handling, full-text hosted search, first-party SaaS apps, and entitlement enforcement are future work. Demo product labels are illustrative; verify current provider pricing before publishing.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the gradual path toward 10 lakh registered users and launch requirements.


## Access-rule tests

With the Firebase CLI installed and Java 21 available, run `npm run test:rules`. The suite verifies public catalog access, bookmark ownership/schema, and rejection of client-written billing records.

