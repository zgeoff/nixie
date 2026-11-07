#!/bin/sh
# Writes one line every 50 ms until ./stop exists: the time, the guest's used memory
# (MemTotal less MemAvailable), its anonymous memory, and each process over 5 MiB as
# name=rss/anonymous, all in MiB.
out=$1
: > "$out"

while [ ! -e stop ]; do
  used=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print int((t-a)/1024)}' /proc/meminfo)
  anon=$(awk '/AnonPages/{print int($2/1024)}' /proc/meminfo)
  procs=""

  for status in /proc/[0-9]*/status; do
    line=$(awk '/^Name:/{n=$2}/^VmRSS:/{r=int($2/1024)}/^RssAnon:/{a=int($2/1024)}END{if(r>5)printf "%s=%s/%s ", n, r, a}' "$status" 2> /dev/null)
    procs="$procs$line"
  done

  echo "$(date +%s%N | cut -c1-13) used=$used anon=$anon $procs" >> "$out"
  sleep 0.05
done
