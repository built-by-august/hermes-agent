#!/bin/sh
# nginx entrypoint: substitute ${API_UPSTREAM} in the config, then exec nginx.
set -e
API_UPSTREAM="${API_UPSTREAM:-http://api:4000}"
export API_UPSTREAM
# Only the API_UPSTREAM var is substituted (avoid clobbering nginx's own $vars).
envsubst '${API_UPSTREAM}' < /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp
mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
