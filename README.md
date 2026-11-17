# MediCare

Application web de **gestion de rendez-vous médicaux** pour un petit cabinet.
Projet académique : simple, lisible, fonctionne **hors ligne** avec une base MongoDB installée sur l'ordinateur.

Interface en **français**. Trois rôles : administrateur, médecin, patient.

## Fonctionnalités

| Rôle | Ce qu'il peut faire |
|---|---|
| **Patient** | Créer son compte, rechercher un médecin par spécialité, voir les créneaux libres, réserver, modifier ou annuler un rendez-vous, consulter son historique, modifier son profil |
| **Médecin** | Définir ses disponibilités (créneaux de 15 à 60 min, sans chevauchement), voir son agenda du jour et tous ses rendez-vous, annuler un rendez-vous |
| **Administrateur** | Gérer médecins, patients, spécialités, administrateurs, disponibilités et rendez-vous de tout le monde |

Règles garanties par le serveur (et testées) : un créneau occupé ne peut pas être réservé, deux réservations
simultanées ne créent jamais de double réservation, une annulation libère le créneau, on ne réserve pas dans le passé,
un patient ne peut pas avoir deux rendez-vous en même temps, les disponibilités d'un médecin ne se chevauchent pas.
Supprimer un médecin ou un patient qui a des rendez-vous à venir est refusé ; avec seulement un historique, le compte
est désactivé et l'historique conservé.

Une **API REST** (`/api/v1`) expose les mêmes fonctions : voir [`docs/API.md`](docs/API.md). L'adresse
`http://127.0.0.1:3000/api/v1` affiche l'index de l'API ; connectez-vous d'abord dans l'application web pour pouvoir
ouvrir les adresses de lecture (`GET`) directement dans le navigateur.

## Démarrage rapide

1. Installer Node.js (version 20 ou plus) et MongoDB Community Server, **et démarrer MongoDB**.
   Guides pas à pas : [**Windows**](docs/INSTALL-WINDOWS.md) · [**Arch Linux**](docs/INSTALL-ARCH.md).
2. Dans le dossier du projet :

```bash
npm install
cp .env.example .env        # Windows : copy .env.example .env
# éditez .env : donnez une vraie valeur à SESSION_SECRET
npm run seed                # données fictives de démonstration
npm start                   # http://127.0.0.1:3000
```

### Comptes de démonstration

Mot de passe de **tous** les comptes : `MediCare2026!`

| Rôle | E-mail |
|---|---|
| Administrateur | `admin@medicare.test` |
| Médecins | `aline.niyonkuru@medicare.test` (généraliste), `pascal.ndayishimiye@medicare.test` (cardiologue), `sandrine.hakizimana@medicare.test`, `eric.nsengiyumva@medicare.test`, `claudine.irakoze@medicare.test`, `joel.bigirimana@medicare.test` |
| Patients | `marie.uwimana@medicare.test`, `jean.niyonzima@medicare.test`, `grace.ndikumana@medicare.test`, `david.habonimana@medicare.test`, … |

Ce sont des comptes **fictifs** pour la démonstration : ne les gardez pas sur une installation réelle.

> **Avant une présentation :** les créneaux de démonstration couvrent les **7 prochains jours ouvrés à partir du jour où
> vous lancez `npm run seed`**. Relancez `npm run seed -- --reset` (serveur arrêté) peu avant la démonstration pour avoir
> des créneaux à jour.

## Installation sur Windows (résumé)

Guide détaillé, écrit pour quelqu'un qui n'a jamais utilisé la ligne de commande :
[`docs/INSTALL-WINDOWS.md`](docs/INSTALL-WINDOWS.md). Internet n'est nécessaire qu'**une seule fois** (télécharger
Node.js, MongoDB et les dépendances) : ensuite MediCare fonctionne hors ligne.

**Préparer le paquet (sur la machine de développement).** Si le dépôt GitHub est privé, « Download ZIP » demande une
connexion à GitHub. Créez plutôt un ZIP propre, sans `.env` ni `node_modules` :

```bash
git archive --format=zip -o medicare.zip HEAD
```

Copiez `medicare.zip` sur l'ordinateur Windows (clé USB, e-mail…). Si le dépôt est public, le bouton vert
**Code → Download ZIP** suffit.

**Sur l'ordinateur Windows :**

1. Installer **Node.js** (version **LTS**, fichier `.msi` sur nodejs.org) : *Next* partout, option « Add to PATH » cochée.
2. Installer **MongoDB Community Server** (fichier `.msi` sur mongodb.com/try/download/community) : choisir
   **Complete** et **laisser cochée** l'option « Install MongoDB as a Service ».
3. Vérifier que MongoDB tourne : touche Windows, taper `services.msc`, Entrée. La ligne **MongoDB Server (MongoDB)**
   doit indiquer « En cours d'exécution » (sinon : clic droit, Démarrer).
4. Extraire `medicare.zip` dans un dossier simple, par exemple **`C:\medicare`** (évitez le Bureau et OneDrive).
5. Dans l'explorateur, ouvrir `C:\medicare`, cliquer dans la barre d'adresse, taper `cmd`, Entrée. Une fenêtre noire
   s'ouvre (utilisez `cmd`, pas PowerShell).
6. Dans la fenêtre noire, une commande à la fois, en attendant la fin de chacune :

   ```
   npm install
   copy .env.example .env
   notepad .env
   ```

   Dans le Bloc-notes, remplacez la valeur de `SESSION_SECRET` par au moins 20 lettres et chiffres au hasard,
   sans espaces, puis enregistrez (Ctrl + S).
7. Charger les données de démonstration, puis lancer :

   ```
   npm run seed
   npm start
   ```

8. Ouvrir **http://127.0.0.1:3000** dans Chrome ou Edge et se connecter avec un compte de démonstration
   (mot de passe `MediCare2026!`, voir plus haut).

**Les fois suivantes :** ouvrir `cmd` dans le dossier et taper seulement `npm start` (arrêt : Ctrl + C).
**Avant une présentation :** serveur arrêté, `npm run seed -- --reset` pour avoir des créneaux à jour.

Problèmes fréquents (`npm` non reconnu, MongoDB non démarré, port déjà utilisé…) : voir le tableau de dépannage de
[`docs/INSTALL-WINDOWS.md`](docs/INSTALL-WINDOWS.md).

## Parcours de démonstration (5 à 7 minutes)

1. **Patient** (`marie.uwimana@medicare.test`) : *Prendre rendez-vous* → spécialité *Cardiologie* → *Voir les créneaux*
   → choisir un créneau → *Confirmer*. Dans *Mes rendez-vous* : *Modifier* (autre créneau), puis *Annuler*.
2. **Médecin** (`pascal.ndayishimiye@medicare.test`) : *Agenda du jour* (changer de jour), puis *Mes disponibilités* →
   *Ajouter des créneaux*. Essayer d'ajouter une plage qui en chevauche une autre : le chevauchement est refusé.
3. **Administrateur** : *Médecins* (fiche, modification), *Spécialités*, *Utilisateurs*. Essayer de supprimer un médecin
   qui a un rendez-vous à venir : c'est refusé avec une explication.
4. **Pas de double réservation** : ouvrir deux navigateurs avec deux patients différents, afficher le même créneau dans
   les deux, confirmer dans le premier puis dans le second : le second reçoit « Ce créneau n'est plus disponible ».

## Commandes

| Commande | Effet |
|---|---|
| `npm start` | Lance l'application sur http://127.0.0.1:3000 |
| `npm run dev` | Idem avec rechargement automatique (développement) |
| `npm run seed` | Remplit une base **vide** avec les données de démonstration (refuse sinon) |
| `npm run seed -- --reset` | **Efface la base** puis remet les données de démonstration |
| `npm run create-admin -- <e-mail> <mot_de_passe> <prénom> <nom>` | Crée un compte administrateur |
| `npm test` | Lance les tests (MongoDB doit tourner ; bases temporaires, votre base n'est pas touchée) |
| `npm run build:assets` | Régénère la feuille d'icônes et copie les polices (inutile en usage normal) |

## Configuration (`.env`)

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | `development` ou `production` | `development` |
| `MONGODB_URI` | Adresse de la base | `mongodb://127.0.0.1:27017/medicare` |
| `SESSION_SECRET` | Secret des sessions (**obligatoire**, à personnaliser) | — |
| `CLINIC_TIMEZONE` | Fuseau horaire du cabinet (heures saisies et affichées) | `Africa/Bujumbura` |
| `COOKIE_SECURE` | `true` seulement si le site est servi en HTTPS | `false` |
| `BCRYPT_ROUNDS` | (avancé) coût du hachage des mots de passe | `10` |

Le fichier `.env` n'est jamais versionné (il est dans `.gitignore`).

## Choix techniques

- **Serveur :** Node.js, Express. **Pages :** Pug, JavaScript natif, CSS maison, icônes Lucide (copiées en local).
  **Base :** MongoDB local avec Mongoose. Pas de framework front, pas de CDN, pas de service externe.
- **Une seule logique métier** (`src/services`) partagée par les pages web (`src/routes/web`) et l'API (`src/routes/api`).
- **Heures :** saisies et affichées à l'heure du cabinet, stockées en UTC (tests sur les changements d'heure).
- **Sécurité :** mots de passe hachés (bcrypt), sessions en base (cookie `HttpOnly`, `SameSite=Lax`), contrôle des rôles
  à chaque requête, validation côté serveur, protection contre les requêtes venant d'un autre site (en-tête `Origin`),
  en-têtes de sécurité dont une politique CSP stricte (aucun script ou style en ligne, aucune ressource externe).
- **Concurrence :** pas de transactions (MongoDB local « standalone ») : les opérations sont atomiques, avec index uniques
  et compensation en cas d'échec (détails dans `PROJECT_STATUS.md`).

## Organisation du code

```text
src/
  config/        environnement, base de données, sessions
  controllers/   traitement des requêtes HTTP (api/ pour l'API)
  services/      règles métier (réservation, disponibilités, comptes…)
  models/        schémas Mongoose
  routes/        web/ (pages) et api/ (JSON)
  middleware/    authentification, rôles, sécurité, erreurs
  validators/    validation des saisies
  utils/         heures, dates, sérialisation de l'API
  views/         gabarits Pug (layouts, partials, pages, errors)
  public/        CSS, JavaScript, polices et icônes locales
scripts/         seed, create-admin, build-assets
tests/           tests automatiques (node:test)
docs/            guides d'installation et documentation de l'API
```

## Limites connues

- Les **rappels par e-mail et SMS** et la **vue calendrier** (fonctionnalités optionnelles du cahier des charges)
  ne sont **pas réalisés**.
- Seuls le patient (pour ses propres rendez-vous) et l'administrateur peuvent **déplacer** un rendez-vous, et toujours
  chez le même médecin ; pour changer de médecin, annuler puis reprendre rendez-vous. Le médecin peut annuler.
- Sans transactions, deux demandes strictement simultanées sur des créneaux de départ différents qui se chevauchent
  pourraient passer le contrôle de chevauchement ; seuls les médecins et administrateurs créent des créneaux, le risque
  est faible.
- L'apparence n'a pas été vérifiée automatiquement : la mise en page se contrôle dans un navigateur.
- Le guide Windows a été écrit et vérifié sous Linux (installation propre, tests, démarrage) mais **n'a pas encore été
  exécuté sur une vraie machine Windows** : signalez toute étape qui échoue.

Suivi détaillé du projet : [`PROJECT_STATUS.md`](PROJECT_STATUS.md).
