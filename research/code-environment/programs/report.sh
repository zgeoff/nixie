#!/usr/bin/env bash
# Sums the orders per region with awk and sort, and builds the report with jq. It checks the input
# with ripgrep and file first. Usage: bash report.sh <orders.csv> <out dir>
set -euo pipefail
input="$1"
out="$2"

file --brief --mime-type "$input" | grep -qx 'text/csv\|text/plain'
if rg --quiet --invert-match '^[A-Z]-[0-9]+,[a-z]+,[a-z]+,[0-9]+,[0-9]+,[0-9-]+$' <(tail -n +2 "$input"); then
  echo "a row does not match the order format" >&2
  exit 1
fi

tail -n +2 "$input" |
  awk -F, '{ orders[$2] += 1; units[$2] += $4; revenue[$2] += $4 * $5; items[$2 "," $3] += $4 }
      END {
        for (region in orders) print "region", region, orders[region], units[region], revenue[region]
        for (key in items) { split(key, part, ","); print "item", part[1], part[2], items[key] }
      }' |
  sort > "$out/totals.txt"

grep '^item ' "$out/totals.txt" | sort -k2,2 -k4,4nr -k3,3 | awk '!seen[$2]++ { print $2, $3 }' \
  > "$out/top-items.txt"
grep '^region ' "$out/totals.txt" |
  jq -cS --raw-input --slurp --rawfile top "$out/top-items.txt" '
      ($top | split("\n") | map(select(. != "") | split(" ") | {(.[0]): .[1]}) | add) as $topItems
      | split("\n") | map(select(. != "") | split(" ")
        | {(.[1]): {orders: (.[2] | tonumber), units: (.[3] | tonumber),
                    revenue_cents: (.[4] | tonumber), top_item: $topItems[.[1]]}})
      | add'
