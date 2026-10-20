# Pawvy App - MY Touch 'n Go Payment

MYR payments now use Touch 'n Go (Malaysia National QR, recipient GOH KIEN TAH). SG stays on PayNow.

Where it shows:
- POS MY (/pos/my): QR + name at checkout
- App > Event Sale, when market = MY: PAYMENT card
- MY Invoice and SOA PDFs (DO has no payment block, same as SG)
- Not added to the Order Portal MY (as requested)

Files (copy the code files only, NOT this README or the zip):
- pos/src/paymentInfo.js
- client/src/pages/EventSale.jsx
- client/src/utils/pawvyPdf.js
- client/src/utils/tngPayment.js (new)

```
git checkout staging
git pull origin staging
# copy the 4 files above into the repo, same paths
git add -A
git commit -m "MY: Touch 'n Go payment (POS, Event Sale, Invoice/SOA)"
git push origin staging
```
Test on staging, then merge staging to main when ready.
