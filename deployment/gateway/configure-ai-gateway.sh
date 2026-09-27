#!/bin/sh
set -eu

AI_GATEWAY_ORIGIN=${AI_GATEWAY_URL:-}
AI_GATEWAY_ENABLED=1
if [ -z "$AI_GATEWAY_ORIGIN" ]; then
    AI_GATEWAY_ORIGIN=http://127.0.0.1:9
    AI_GATEWAY_ENABLED=0
elif ! printf '%s\n' "$AI_GATEWAY_ORIGIN" | grep -Eq '^https?://([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[a-fA-F0-9:]+\])(:[0-9]{1,5})?$'; then
    echo 'AI_GATEWAY_URL must be an http(s) origin without credentials, path, query, or fragment' >&2
    exit 1
fi
export AI_GATEWAY_ORIGIN AI_GATEWAY_ENABLED
envsubst '${AI_GATEWAY_ORIGIN} ${AI_GATEWAY_ENABLED}' < /etc/nginx/kochwiki-gateway.conf.template > /etc/nginx/conf.d/default.conf
