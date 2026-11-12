# Pawvy App - Order Sent Frame

One complete file: portal/src/App.jsx. Only the ORDER SENT screen changes: the order list now sits on a cream frame with a soft shadow so the navy header no longer blends into the page. Nothing else is touched.

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main   # staging should include the order-list redesign already merged to main
# copy portal/src/App.jsx from this zip into the repo (replace the file), then:
git add portal/src/App.jsx
git commit -m "Order Portal: cream frame around ORDER SENT document"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
