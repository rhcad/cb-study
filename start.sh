#!/bin/sh
if [ ! $1 ]; then
    set $1 8003
fi
kill -9 `ps -ef | grep $1 | grep main.py | awk -F" " {'print $2'}` 2>/dev/null
cd `dirname $0`/maker
test -d ../log || mkdir ../log
find `dirname $0` -name "*.pyc" | xargs rm -rf
nohup python3 main.py --port=$1 --debug=true >> ../log/app.log 2>&1 &
