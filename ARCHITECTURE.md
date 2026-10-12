# Architecture and gradual scaling

## Core flow

React static assets → Firebase Hosting CDN
React → Firebase Auth (Google identity)
React → App Check → Firestore (public catalog, user-owned bookmarks)
React → App Check + Auth → Cloud Functions → Stripe Checkout / billing portal
Stripe → signed webhook → Cloud Functions → private billing state + event ledger

Free browsing needs no account. Personal cloud collections need authentication. Supporter subscriptions and donations fund the marketplace; each external SaaS provider controls its own plans. Future first-party paid products require a server-side entitlement check on every protected operation.

## Data boundaries

- `products/{productId}`: public curated catalog, writes through trusted Admin SDK only.
- `users/{uid}/bookmarks/{productId}`: owner-only reads/create/delete; immutable validated fields.
- `users/{uid}/billing/account`: server-written billing customer, owner-readable.
- `users/{uid}/subscriptions/{subscriptionId}`: server-owned subscription state; owner-readable.
- `billingEvents/{stripeEventId}`: private webhook deduplication ledger.
- `checkoutLimits/{uid}`: private per-user request throttle.
- `donations/{checkoutSessionId}`: private settled contribution ledger.

No public access to customers, donations, or billing events. App Check helps reduce abuse but is not authorization. Enforce quotas on expensive operations and use backend rate limits.

## Path to 10 lakh (1,000,000) registered users

User count alone does not define capacity. Establish daily/monthly active users, peak concurrent users, reads/writes per session, geography, catalog size, and function latency targets. This starter has not been load-tested at this scale.

1. MVP / first 1,000 users: static CDN frontend, small bounded catalog query (60 records), one-time bookmark reads (200 records), monitoring and billing alerts. No global real-time listeners. Test rules with emulators and payment flows with Stripe test mode before launch.
2. 1,000–100,000: replace the starter catalog fetch with cursor pagination and category indexes; use CDN-cached catalog snapshots, virtualize long lists, and paginate bookmarks. Add hosted full-text search for a large catalog (Firestore is not a search engine). Add moderation and CI deployments; test progressively increasing concurrency.
3. 100,000–1,000,000: serve discovery from CDN/search instead of fetching Firestore documents per visitor. Keep user state partitioned by UID. Queue email, analytics, and indexing jobs with Cloud Tasks/Pub/Sub. Adjust Cloud Functions concurrency/max instances based on measured latency and downstream quotas. Load-test expected peak traffic plus headroom, including webhook replay, failures, and surge recovery.

Avoid sequential IDs and shared write counters. Roll new collection traffic out with Firebase's 500/50/5 guidance: start at at most 500 operations/sec and increase 50% every five minutes. Model hot keys and index fanout, not only total storage. Billing alerts notify; they do not cap spending. Build an operational kill switch for expensive workloads.

## Reliability and launch work

- Unit/emulator integration tests for unauthorized access, ownership, schema restrictions, and payment lifecycle; sandbox end-to-end checkout, cancellation, renewals, duplicate/out-of-order webhooks, and retries.
- Structured monitoring: error rates, p95 latency, DB operations/session, Auth quotas, App Check rejections, checkout conversion, payment retries, and search lag.
- Environment isolation: development, staging, production; separate secrets, restricted IAM, CI service account, backups and restore drills.
- Webhook processing currently reads Stripe's current state before a transaction. A production entitlement system must serialize updates per subscription or reconcile periodically to eliminate concurrent stale writes. Handle multiple subscriptions explicitly. Keep dedupe records through the retry window and configure retention after defining audit requirements.
- Add seller onboarding and payout architecture only if the marketplace will collect on sellers' behalf; use a suitable connected-account payment service and compliance workflow.
- Complete a screen-reader/browser QA pass, privacy/terms, support and deletion flows before public launch.

## Primary references

- https://firebase.google.com/docs/firestore/best-practices
- https://firebase.google.com/docs/firestore/understand-reads-writes-scale
- https://firebase.google.com/docs/app-check/cloud-functions
- https://docs.stripe.com/api/checkout/sessions
- https://docs.stripe.com/webhooks

These describe service behavior, not a guarantee that an untested application supports a million active users.


## Verified in this workspace

Frontend and Cloud Functions TypeScript production builds pass. Dependency audits report zero vulnerabilities after SDK updates and a gRPC override. Rule integration tests are provided; running them requires the Firebase CLI and a current Java runtime (Java 21 recommended). This machine has Java 8, so emulator tests were not executed. Live Auth, App Check, checkout, and browser interactions still need verification against a configured staging project.

