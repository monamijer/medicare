# Installation sur Arch Linux

## 1. Prérequis

```bash
sudo pacman -S --needed nodejs npm git
```

MongoDB n'est plus dans les dépôts officiels : installez-le depuis l'AUR (avec `yay` ou `paru`) :

```bash
yay -S mongodb-bin
```

Démarrez-le et activez-le au démarrage :

```bash
sudo systemctl enable --now mongodb
```

Vérifiez qu'il tourne :

```bash
systemctl status mongodb      # doit afficher « active (running) »
```

(Optionnel) pour l'inspecter en ligne de commande : `yay -S mongosh-bin`, puis `mongosh --eval "db.runCommand({ ping: 1 })"`.

## 2. Récupérer le projet

```bash
git clone https://github.com/VOTRE-COMPTE/medicare.git
cd medicare
```

## 3. Installer et configurer

```bash
npm install
cp .env.example .env
```

Éditez `.env` et remplacez `SESSION_SECRET` par une valeur secrète. Pour en générer une :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

L'adresse de la base reste `mongodb://127.0.0.1:27017/medicare` (on utilise `127.0.0.1` et non `localhost`).

## 4. Données de démonstration et lancement

```bash
npm run seed        # crée des données fictives (refuse si la base contient déjà des données)
npm start           # http://127.0.0.1:3000
```

Pour travailler avec rechargement automatique : `npm run dev`.

Comptes de démonstration, mot de passe commun **`MediCare2026!`** :
`admin@medicare.test`, `pascal.ndayishimiye@medicare.test` (médecin), `marie.uwimana@medicare.test` (patient).

## 5. Tests

```bash
npm test
```

Les tests ont besoin que MongoDB tourne. Ils créent des bases temporaires (`medicare_test_<n>`),
supprimées à la fin : votre base `medicare` n'est jamais touchée.

## Dépannage

| Message | Solution |
|---|---|
| `Impossible de se connecter à MongoDB` | `sudo systemctl start mongodb` |
| `SESSION_SECRET est manquant` | `cp .env.example .env` puis renseignez la valeur |
| `La base contient déjà des données` | `npm run seed -- --reset` (efface tout, arrêtez le serveur avant) |
| Port 3000 occupé | changez `PORT` dans `.env` |
