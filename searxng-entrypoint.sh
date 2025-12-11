#!/bin/sh
set -e

export SEARXNG_SETTINGS_PATH='/etc/searxng/settings.yml'
export FLASK_APP=searx/webapp.py

cd /usr/local/searxng/searxng-src

exec /usr/local/searxng/searx-pyenv/bin/python -m flask run --host=0.0.0.0 --port=8080

