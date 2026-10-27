#!/usr/bin/env bash
set -euo pipefail

bash /opt/identity-provider/apply-config.sh /opt/identity-provider/config
export KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD"
/opt/keycloak/bin/kcadm.sh create users -r services -f /opt/e2e/user.json \
  --no-config --server http://localhost:8080 --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME"
