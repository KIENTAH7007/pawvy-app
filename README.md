# Pawvy App - Portal Amount Spacing

One complete file: portal/src/App.jsx. Amounts in the Order Portal pop-ups, the bottom Review Order bar and the review-page nudge now have a space after the symbol: "$ 177.20" (SG) and "RM 570.00" (MY). Nothing else changes.

This builds on the previous patch (Dollar Sign and RM Wording), which is on staging.

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
# replace portal/src/App.jsx with the file from this zip, then:
git add portal/src/App.jsx
git commit -m "Order Portal: space between currency symbol and amount"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
