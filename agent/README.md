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
