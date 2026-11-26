# Pawvy App — Fix: Consignment Unit Cost hidden right after ops login

Only one file: client/src/pages/Consignment.jsx

## STAGING
```
cd pawvy-app
git checkout staging
git pull
git merge main
# copy client/src/pages/Consignment.jsx from this zip into the repo (replace)
git add client/src/pages/Consignment.jsx
git commit -m "Consignment: hide Unit Cost for ops straight after login"
git push origin staging
```

## Then merge to MAIN
```
git checkout main
git pull
git merge staging
git push origin main
```
