# Pawvy App - Portal Email Field

One complete file: portal/src/App.jsx.
- The portal no longer remembers the email address (any address saved earlier on a device is cleared the next time the portal opens).
- The grey "you@yourshop.com" hint is removed from the email field.

## 1. Test on staging
cd pawvy-app
git checkout staging
git pull
git merge main
# replace portal/src/App.jsx with the file from this zip, then:
git add portal/src/App.jsx
git commit -m "Order Portal: do not remember email, remove email placeholder"
git push origin staging

## 2. After you are happy, merge to main
git checkout main
git pull
git merge staging
git push origin main
