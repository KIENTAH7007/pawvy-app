# Pawvy App - Order Portal Delivery Nudges + Order Copy

App only (SG and MY portals share the same code). No Website zip needed.

## What it does
**Order Portal (SG and MY)**
- Free delivery (FOC) at **S$200 and above (SG)** / **RM600 and above (MY, West Malaysia)**.
- Below that, when the partner presses Submit, a pop-up asks: "Add S$X for FOC delivery?" with **Add more items** or **Proceed anyway** (wording says "a delivery fee may apply", no amount).
- Review page: a box shows how much more to add for FOC delivery. A slim line in the bottom bar shows the same while they browse.
- SG only: from S$350.00 to S$399.99 it says how much to add for the **S$12 cash rebate** (unlocked at S$400.00). From S$550.00 to S$599.99, how much to add for the **S$30 cash rebate** (unlocked at S$600.00). Worked out in exact cents.
- The delivery wording on the review page now says "$200 and above / $400 and above / $600 and above" (matches how the App already calculates rebates).
- New optional **Email** field: the partner gets "We've received your order, thank you!" with their order list. It is sent AFTER the order is saved and can never block or break an order. A typed email address is used (nothing is looked up). It is remembered on their device for next time.
- The ORDER SENT screen now shows the list they ordered, plus a "Save / print this list" button.

**Pending Orders (App)**
- Orders under the FOC amount get a small amber **BELOW FOC** tag. The same warning is added to your new-order Telegram/email alert. You then add the delivery fee yourself as usual.
- The order amount is calculated on the server from your prices, not taken from the browser.

**Database:** 3 new columns on portal orders (order_subtotal, below_foc, contact_email), added automatically on deploy. Old orders are untouched (no tag).

**Files (7):** server/database.js, server/utils/notify.js, server/routes/portal.js, server/lib/portalOrderEmail.js (new), client/src/pages/PendingOrders.jsx, portal/src/api.js, portal/src/App.jsx

**Not changed:** customer verification/login emails, website checkout, POS, and the existing sender code. The new email only calls the existing sender.

## 1) Staging
```
cd pawvy-app
git checkout staging
git pull origin staging
```
Copy the `server`, `client` and `portal` folders from this zip into your repo (merge/overwrite). Do not copy this README or the zip.
```
git add -A
git commit -m "Order Portal: FOC/rebate nudges, below-FOC pop-up, emailed order copy, Below FOC tag"
git push origin staging
```
Check on staging (use your staging portal link, and add /my for Malaysia):
1. Add items to a cart under S$200 and tap Submit: the pop-up appears. "Add more items" goes back with the cart kept.
2. Type your own email, submit an order: ORDER SENT shows the list, and the email arrives.
3. In Pending Orders the order has the **BELOW FOC** tag. An order of S$200+ does not.
4. Do one normal customer signup on the staging website to confirm the verification email still arrives.
Pending orders you create while testing can be Rejected in Pending Orders.

## 2) Merge to main (production)
```
git checkout main
git pull origin main
git merge staging
git push origin main
```
