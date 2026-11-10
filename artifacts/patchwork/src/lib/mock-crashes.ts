// Display-only fixtures. Never submitted to the durable worker or external services.
export const mockCrashes = [
  {
    id: "MOCK-001",
    title: "React · Too many re-renders",
    service: "storefront-web",
    location: "src/components/checkout/OrderSummary.tsx:47",
    trace: `Error: Too many re-renders. React limits the number of renders to prevent an infinite loop.
    at renderWithHooksAgain (/app/node_modules/react-dom/cjs/react-dom-client.development.js:7747:17)
    at renderWithHooks (/app/node_modules/react-dom/cjs/react-dom-client.development.js:7665:21)
    at updateFunctionComponent (/app/node_modules/react-dom/cjs/react-dom-client.development.js:10166:19)
    at beginWork (/app/node_modules/react-dom/cjs/react-dom-client.development.js:11778:18)
    at performUnitOfWork (/app/node_modules/react-dom/cjs/react-dom-client.development.js:17641:22)
    at workLoopSync (/app/node_modules/react-dom/cjs/react-dom-client.development.js:17469:41)

Component stack:
    at OrderSummary (/app/src/components/checkout/OrderSummary.tsx:47:9)
    at CheckoutPage (/app/src/pages/CheckoutPage.tsx:83:5)
    at CartProvider (/app/src/providers/CartProvider.tsx:28:3)

Context: service=storefront-web environment=production release=web-2026.11.10.1
Route: GET /checkout · state update during OrderSummary render
Source excerpt: setDiscountTotal(calculateDiscount(items, coupon));`,
  },
  {
    id: "MOCK-002",
    title: "Python · ZeroDivisionError",
    service: "billing-service",
    location: "billing/services/proration.py:64",
    trace: `2026-11-10T06:14:32.417Z ERROR billing.worker Invoice generation failed
Traceback (most recent call last):
  File "/app/billing/workers/invoice_worker.py", line 118, in process_invoice
    invoice = invoice_service.generate(subscription, period)
  File "/app/billing/services/invoice_service.py", line 207, in generate
    line_items = self._build_line_items(subscription, period)
  File "/app/billing/services/invoice_service.py", line 156, in _build_line_items
    amount = calculate_prorated_amount(plan.unit_price, active_days, period_days)
  File "/app/billing/services/proration.py", line 64, in calculate_prorated_amount
    daily_rate = unit_price / period_days
ZeroDivisionError: division by zero

Context: service=billing-service environment=production release=billing-2026.11.10.3
Job: generate_invoice · queue=billing.invoices · attempt=3
Inputs: unit_price=Decimal('149.00'), active_days=0, period_days=0
Period: start=2026-11-10T00:00:00Z end=2026-11-10T00:00:00Z
Trigger: same-day subscription cancellation produced an empty billing period`,
  },
  {
    id: "MOCK-003",
    title: "Node.js · Unhandled Promise Rejection",
    service: "notification-worker",
    location: "src/workers/delivery-worker.js:72",
    trace: `2026-11-10T06:16:08.931Z ERROR notification-worker Unhandled promise rejection
node:internal/process/promises:391
    triggerUncaughtException(err, true /* fromPromise */);
    ^

Error: connect ECONNREFUSED 10.24.6.18:6379
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1611:16)
    at async RedisClient.connect (/app/src/clients/redis-client.js:38:7)
    at async reserveDelivery (/app/src/services/delivery-service.js:91:5)
    at async deliverNotification (/app/src/services/delivery-service.js:134:19)

Unhandled promise created at:
    at /app/src/workers/delivery-worker.js:72:17
    at Array.forEach (<anonymous>)
    at processBatch (/app/src/workers/delivery-worker.js:70:13)
    at async consume (/app/src/workers/queue-consumer.js:46:9)

Context: service=notification-worker environment=production release=notify-2026.11.10.2
Runtime: Node.js v20.18.1 · --unhandled-rejections=throw
Batch: 25 messages · dependency=redis · code=ECONNREFUSED
Source excerpt: messages.forEach(async (message) => { await deliverNotification(message); });`,
  },
] as const;
