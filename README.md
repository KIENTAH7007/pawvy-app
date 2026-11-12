# Pawvy App - Order Portal Copy Redesign

Builds on the Order Portal patch already on staging. Four complete files, no database changes.

Files:
- server/utils/notify.js  (resendSend can now carry an optional attachment; customer verification emails unchanged)
- server/lib/portalOrderEmail.js  (invoice-style email + A4 PDF "Pawvy-Order-List.pdf")
- server/routes/portal.js  (builds the PDF, emails it, returns it to the portal)
- portal/src/App.jsx  (pop-up wording, new SG rebate pop-ups, ORDER SENT document, Download PDF)

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
# copy the 4 files from this zip into the same paths in the repo, then:
git add server/utils/notify.js server/lib/portalOrderEmail.js server/routes/portal.js portal/src/App.jsx
git commit -m "Order Portal: invoice-style order list email + PDF, rebate pop-ups, copy fixes"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
