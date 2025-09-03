cd /home/ubuntu/GitHub/metriq-web
git stash
git pull
git stash apply
npm i 2>/dev/null

cd /home/ubuntu/GitHub/metriq-web/metriq-app
git stash
git pull
git stash apply
npm i 2>/dev/null
