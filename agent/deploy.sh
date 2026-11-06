#!/usr/bin/env bash
# Déploie l'agent sur le VPS : récupère main, redémarre le service PM2.
# Appelé par GitHub Actions via une clé SSH restreinte à cette seule commande
# (voir agent/README.md, section « Déploiement automatique »).
set -euo pipefail

# Une session SSH non interactive ne charge pas toujours nvm : on le charge si présent pour retrouver pm2.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
command -v pm2 >/dev/null 2>&1 || { echo "pm2 introuvable dans le PATH" >&2; exit 1; }

cd "$(dirname "${BASH_SOURCE[0]}")/.."
echo "== Déploiement de l'agent : $(date -Is) =="
git pull --ff-only origin main
python3 -m py_compile agent/main.py agent/gemini_network.py
pm2 restart livekit-recruitment-agent
sleep 3
pm2 status livekit-recruitment-agent
echo "== Version déployée : $(git log -1 --format='%h %s') =="
