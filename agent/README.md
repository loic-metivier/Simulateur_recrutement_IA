# Agent vocal EVA

Le worker accepte uniquement les salons `room_recruiter-*` et s’enregistre sous le nom `recruitment-agent`. L’API `api/get-token.ts` demande explicitement ce worker via la configuration du salon.

Les scénarios prédéfinis sont dans `main.py`. Les scénarios personnalisés sont validés par `utils/livekit-token.ts` puis transmis dans les métadonnées signées du job. Firestore sert au suivi, pas au démarrage vocal.

## Configuration

Définir dans `agent/.env` : LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET et GEMINI_API_KEY. Ne pas committer les valeurs.

Sur le VPS OVH concerné, conserver `GEMINI_FORCE_IPV4=1` dans l’environnement PM2. Le module `gemini_network.py` limite ce réglage au WebSocket Gemini ; il conserve la vérification TLS. Le trajet IPv6 de ce VPS déclenchait une erreur de localisation chez Gemini.

Lancement : `venv/bin/python main.py start`.
Service existant : `livekit-recruitment-agent` dans PM2, dossier `/home/ubuntu/Simulateur_recrutement_agent/agent`.

## Vérification

- `node --test tests/*.test.mjs` depuis la racine : jetons, scénario personnalisé, disponibilité de l’agent, annulation et contrôle du micro.
- `python -m py_compile agent/main.py agent/gemini_network.py`.
- En ligne : choisir un scénario, tester le micro, démarrer, vérifier introduction et réponse, couper/réactiver le micro, terminer. Refaire avec une offre personnalisée.
- `agent_ready` annonce que l’introduction a été générée ; `agent_error` arrête l’attente côté navigateur. Le navigateur impose aussi un délai de connexion et propose d’activer le son si l’autoplay est bloqué.

## Réactivité des tours de parole

Gemini détecte la fin de parole après 450 ms de silence par défaut (variable d’environnement `SILENCE_DURATION_MS`, entre 200 et 1500 ; remonter à 600 si le recruteur coupe le candidat), avec `END_SENSITIVITY_HIGH`. La génération vocale utilise `thinking_budget=0` pour limiter l’attente ; le bilan conserve son modèle d’analyse distinct. Le navigateur reçoit `agent_state` pour distinguer écoute, préparation de réponse et parole. Une pause plus longue que le seuil peut être interprétée comme une fin de réponse ; le réseau et la génération ajoutent un délai variable.


## Mesurer la latence

Chaque tour journalise une ligne `LATENCE tour` (fin de parole détectée → début de réponse du recruteur) et `Métriques du tour`. Lecture : `pm2 logs livekit-recruitment-agent --lines 200 | grep -E "LATENCE|Métriques"`. Ce délai exclut le silence de détection, à ajouter pour obtenir le ressenti total.


## Variété des questions

Pour les scénarios prédéfinis, chaque entretien tire 4 questions au hasard dans un stock d'environ 10 (`EXTRA_QUESTIONS` + questions clés de `RECRUITERS`) et l'agent est invité à les reformuler et à rebondir sur les réponses. La question d'accroche reste fixe. Pour ajouter des questions, compléter `EXTRA_QUESTIONS` dans `main.py`. Les scénarios créés à partir d'une offre sont gérés côté navigateur (`buildCustomSystemInstruction` dans `app.js`).

## Déploiement automatique (GitHub Actions)

À chaque push sur `main` qui touche `agent/`, le workflow `.github/workflows/deploy-agent.yml` se connecte au VPS en SSH et exécute `agent/deploy.sh` (`git pull --ff-only`, vérification de syntaxe Python, `pm2 restart livekit-recruitment-agent`). On peut aussi le lancer à la main : onglet *Actions* → *Déployer l'agent sur le VPS* → *Run workflow*. Tant que les secrets ci-dessous ne sont pas configurés, le workflow ne fait rien.

Configuration à faire une seule fois :

1. **Clé dédiée** (sur ton Mac, sans passphrase, utilisée uniquement par GitHub) :
   `ssh-keygen -t ed25519 -f ~/.ssh/ovh_deploy -N "" -C github-deploy`
2. **Autoriser la clé sur le VPS**, limitée à la seule commande de déploiement : ajouter cette ligne à `~/.ssh/authorized_keys` de l'utilisateur `ubuntu` (remplacer `CLE_PUBLIQUE` par le contenu de `~/.ssh/ovh_deploy.pub`) :
   `command="bash /home/ubuntu/Simulateur_recrutement_agent/agent/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty CLE_PUBLIQUE`
3. **Secrets GitHub** (*Settings → Secrets and variables → Actions → New repository secret*) :
   - `VPS_HOST` : `217.182.68.149`
   - `VPS_SSH_KEY` : contenu complet du fichier `~/.ssh/ovh_deploy` (clé privée)
   - `VPS_KNOWN_HOSTS` : résultat de `ssh-keyscan -t ed25519 217.182.68.149` (comparer l'empreinte avec celle déjà connue de ton Mac)
   - `VPS_USER` (optionnel) : `ubuntu` par défaut
4. **Dépôt cloné en HTTPS sur le VPS** : `git remote -v` doit afficher une URL `https://github.com/...` (le dépôt est public, aucun identifiant n'est nécessaire).

Limites : le déploiement redémarre l'agent, ce qui coupe un entretien en cours ; si `agent/requirements.txt` change, les dépendances doivent être installées à la main sur le VPS.
