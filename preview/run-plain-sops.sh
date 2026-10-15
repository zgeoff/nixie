#!/bin/sh
# Stands in for sops in the preview, whose secrets file holds only a throwaway key and a
# placeholder, so it is plain YAML: it prints the file as JSON, as sops decrypt does.
exec bun /app/apps/server/src/test-utils/run-stub-sops.ts "$@"
