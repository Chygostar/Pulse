# Pulse

ENT élève : École Directe et Pronote, avec notes, devoirs, planning et révisions par IA. Installable comme application (PWA).

## Lancer
    npm install
    npm start
Puis ouvrir http://localhost:3000

`npm run dev` relance le serveur automatiquement à chaque modification.

## Fonctions IA (Groq)
Crée un fichier `.env` à la racine :

    GROQ_API_KEY=ta-cle
    AI_MODEL=openai/gpt-oss-120b

Sans clé, le chronomètre, le Pomodoro et le planning fonctionnent (estimations approximatives) ; seules les fiches IA et l'estimation IA sont désactivées.

## Hors ligne
Après une première synchronisation, les notes, devoirs et emplois du temps sont gardés sur l'appareil : l'application reste consultable sans Internet (bandeau orange « Hors ligne »). Se déconnecter efface ces données.
