# Agent vocal EntretienLab

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
