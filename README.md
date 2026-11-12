# Pawvy App - Portal Rebate Wording

One complete file: portal/src/App.jsx.
- Rebate amounts now have a space: "$ 12 cash rebate" and "$ 30 cash rebate" (pop-up title, bottom bar, review-page nudge and the "rebate unlocked" line).
- The rebate pop-up no longer repeats "Orders of $400 / $600 and above get a ... cash rebate."

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# replace portal/src/App.jsx with the file from this zip, then:
git add portal/src/App.jsx
git commit -m "Order Portal: rebate amount spacing, remove repeated rebate sentence"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
