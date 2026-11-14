# Installation sur Windows 10 / 11

Ce guide est écrit pour quelqu'un qui n'a jamais utilisé la ligne de commande.
Comptez environ 20 minutes. **Aucune connexion Internet n'est nécessaire pour utiliser MediCare**,
seulement pour télécharger les programmes de l'étape 1 et 2.

Vous allez installer deux programmes (Node.js et MongoDB), puis préparer MediCare.

---

## Étape 1 : installer Node.js

1. Allez sur **https://nodejs.org** et téléchargez la version **LTS** (le gros bouton vert).
2. Double-cliquez sur le fichier téléchargé et cliquez sur **Next** à chaque écran, **sans rien changer**
   (laissez cochée l'option « Add to PATH »), puis **Install** et **Finish**.

## Étape 2 : installer MongoDB (la base de données)

1. Allez sur **https://www.mongodb.com/try/download/community**.
2. Choisissez **Platform : Windows**, **Package : msi**, puis **Download**.
3. Double-cliquez sur le fichier téléchargé :
   - choisissez **Complete** ;
   - à l'écran « Service Configuration », **laissez cochée** l'option **Install MongoDB as a Service**
     (MongoDB démarrera alors tout seul avec Windows) ;
   - vous pouvez **décocher** « Install MongoDB Compass » (non nécessaire) ;
   - cliquez sur **Install**, puis **Finish**.

## Étape 3 : vérifier que MongoDB tourne

1. Appuyez sur la touche **Windows**, tapez `services.msc` et appuyez sur Entrée.
2. Dans la liste, cherchez **MongoDB Server (MongoDB)**.
3. La colonne « État » doit afficher **En cours d'exécution**.
   Sinon, faites un clic droit sur la ligne puis **Démarrer**.

## Étape 4 : récupérer MediCare

1. Sur la page GitHub du projet, cliquez sur le bouton vert **Code**, puis **Download ZIP**.
2. Faites un clic droit sur le fichier ZIP téléchargé, **Extraire tout…**, et choisissez un dossier simple,
   par exemple `C:\medicare`.
3. Ouvrez ce dossier : vous devez voir les fichiers `package.json`, `README.md` et le dossier `src`.

## Étape 5 : ouvrir une fenêtre de commandes dans ce dossier

1. Dans l'explorateur Windows, ouvrez le dossier `medicare` (celui qui contient `package.json`).
2. Cliquez dans la **barre d'adresse** en haut (celle qui affiche `C:\medicare`), tapez `cmd` et appuyez sur Entrée.
3. Une fenêtre noire s'ouvre : c'est l'**Invite de commandes**. Gardez-la ouverte.

> Utilisez bien « cmd » et non PowerShell : c'est plus simple pour ce projet.

## Étape 6 : installer MediCare

Dans la fenêtre noire, tapez chaque commande, puis appuyez sur Entrée, et **attendez la fin** avant la suivante.

```
npm install
```

(environ 1 minute ; des lignes défilent, c'est normal)

```
copy .env.example .env
```

Cette commande crée votre fichier de configuration `.env`.

## Étape 7 : choisir un mot de passe secret

1. Ouvrez le fichier **`.env`** avec le **Bloc-notes** (clic droit, « Ouvrir avec », « Bloc-notes »).
   Si vous ne voyez pas le fichier : dans l'explorateur, menu **Affichage**, cochez **Extensions de noms de fichiers**.
2. Repérez la ligne `SESSION_SECRET=replace_with_a_secure_secret`.
3. Remplacez `replace_with_a_secure_secret` par une longue suite de lettres et de chiffres de votre choix
   (au moins 20 caractères, sans espaces). Exemple : `SESSION_SECRET=a8f3k29dm4x7q1zp5w0v6b2n`.
4. **Enregistrez** (Ctrl + S) et fermez le Bloc-notes.

> Le fichier doit s'appeler exactement `.env` (et pas `.env.txt`).

## Étape 8 : charger les données de démonstration

Dans la fenêtre noire :

```
npm run seed
```

Cela crée des médecins, des patients, des créneaux et des rendez-vous **fictifs**, et affiche les comptes
de démonstration (voir le tableau plus bas).

## Étape 9 : lancer MediCare

```
npm start
```

Quand vous voyez `MediCare démarré sur http://127.0.0.1:3000`, ouvrez votre navigateur
(Chrome, Edge, Firefox) et allez à l'adresse :

**http://127.0.0.1:3000**

Pour arrêter MediCare : dans la fenêtre noire, appuyez sur **Ctrl + C**.

### Les fois suivantes

Il suffit de : ouvrir une fenêtre de commandes dans le dossier (étape 5), puis taper `npm start`.
(MongoDB démarre tout seul avec Windows.) Ne relancez pas `npm run seed`, sauf pour tout remettre à zéro (voir plus bas).

---

## Comptes de démonstration

Mot de passe de **tous** les comptes : `MediCare2026!`

| Rôle | Adresse e-mail |
|---|---|
| Administrateur | `admin@medicare.test` |
| Médecin (cardiologue) | `pascal.ndayishimiye@medicare.test` |
| Médecin (généraliste) | `aline.niyonkuru@medicare.test` |
| Patient | `marie.uwimana@medicare.test` |
| Patient | `jean.niyonzima@medicare.test` |

(Les autres médecins et patients sont visibles dans la page **Médecins** / **Patients** de l'administrateur.)

## Tout remettre à zéro

Arrêtez MediCare (Ctrl + C), puis :

```
npm run seed -- --reset
```

**Attention :** cela efface toute la base de MediCare et la remplace par les données de démonstration.

## En cas de problème

| Ce que vous voyez | Que faire |
|---|---|
| `'npm' n'est pas reconnu…` | Node.js n'est pas installé, ou la fenêtre était déjà ouverte. Fermez la fenêtre noire, rouvrez-en une (étape 5). Sinon, réinstallez Node.js (étape 1). |
| `Impossible de se connecter à MongoDB` | MongoDB n'est pas démarré : refaites l'étape 3 (service « MongoDB Server (MongoDB) » : Démarrer). |
| `SESSION_SECRET est manquant` | Le fichier `.env` n'existe pas ou la ligne est vide : refaites les étapes 6 et 7. |
| `La base contient déjà des données` | Normal si vous avez déjà lancé `npm run seed`. Pour repartir de zéro : `npm run seed -- --reset`. |
| `EADDRINUSE` ou « port déjà utilisé » | Un autre programme utilise le port 3000. Dans `.env`, changez `PORT=3000` en `PORT=3001`, puis ouvrez `http://127.0.0.1:3001`. |
| La page ne s'affiche pas | Vérifiez que la fenêtre noire affiche toujours `MediCare démarré…` et utilisez bien `http://127.0.0.1:3000`. |
| Une demande d'autorisation du pare-feu Windows | MediCare n'écoute que sur votre ordinateur : vous pouvez cliquer sur « Annuler » sans conséquence. |
