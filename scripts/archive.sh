#!/bin/bash
set -e
set -o pipefail

find -empty -delete

while true; do
  sqlite3 db.sqlite3 ".schema" > /dev/null
   if [ ! -f db.sqlite3-wal ]; then
    break
   fi
  echo "waiting for db.sqlite3-wal to be deleted"
  sleep 1
done

read -p "name: " name

mkdir -p models

if [ -f "models/$name.zip" ]; then
  read -p "overwrite 'models/$name.zip'? [y/N] " ans
  if [ "$ans" == 'y' ]; then
    rm "models/$name.zip"
  else
    exit 1
  fi
fi

zip -r "models/$name.zip" \
  downloaded \
  dataset \
  classified \
  unclassified \
  db.sqlite3 \
  list.txt \
  saved_models/classifier_model \

echo "archived to models/$name.zip"

rm -rf \
  downloaded \
  dataset \
  classified \
  unclassified \
  db.sqlite3 \
  list.txt \
  saved_models/classifier_model \
