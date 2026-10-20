# Pawvy App - MY Touch n Go QR Fix

Re-cropped the Touch 'n Go QR so the pink frame is tight with even edges (no uneven white margin) in POS MY, Event Sale (MY), and Invoice/SOA.

Copy these 2 code files only (NOT this README or the zip):
- pos/src/paymentInfo.js
- client/src/utils/tngPayment.js

```
git checkout staging
git pull origin staging
# copy the 2 files above into the repo, same paths
git add -A
git commit -m "MY: tighter Touch 'n Go QR crop"
git push origin staging
```
