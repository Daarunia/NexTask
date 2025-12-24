# Todo List

## Description

Ce projet est ma vision d'une *Todo List* moderne, réalisée dans le but de développer mes compétences et d'explorer des technologies que je n'avais pas encore eu l'occasion de découvrir. C'est un projet en constante évolution, où chaque fonctionnalité ajoutée est une occasion d'expérimenter avec de nouvelles approches et d'améliorer ma compréhension du développement logiciel.

Ce projet me permet également de me familiariser avec l'usage de **Vue 3**, **Electron**, **Prisma**, **TailwindCSS**, **Vite**, et bien d'autres outils modernes dans le monde du développement. Le but est d'assembler une *Todo List* fonctionnelle et agréable à utiliser, tout en faisant l'expérience de la gestion d'un projet complet, de la conception à la production.

## Fonctionnalités principales

- **Ajout, suppression et modification de tâches**.
- **Drag-and-drop** pour réorganiser les tâches avec `sortablejs`.
- Interface utilisateur épurée et réactive grâce à **Vue 3** et **TailwindCSS**.
- **Sauvegarde des données** en utilisant **Prisma** pour la gestion d'une base de données (SQL).
- **Authentification et gestion des utilisateurs** (en développement).
- Application de bureau multiplateforme grâce à **Electron**.
  
## Technologies utilisées

### Frontend
- **Vue 3** : Framework JavaScript moderne pour la construction de l'interface utilisateur. Utilisé avec des composants dynamiques et un état réactif grâce à **Pinia**.
- **TailwindCSS** : Utilisé pour styliser l'application de manière rapide et flexible, sans se soucier des classes CSS complexes.
- **PrimeVue** : Une collection de composants UI pour Vue, qui offre une interface soignée et cohérente.
- **Vite** : Outil de build moderne, rapide et optimisé pour Vue, permettant un développement rapide et une meilleure performance.

### Backend et API
- **Fastify** : Framework Node.js rapide et léger pour la création d'une API backend qui gère les requêtes liées aux tâches.
- **Prisma** : ORM (Object Relational Mapping) pour interagir avec la base de données (SQL).
- **Axios** : Pour effectuer des requêtes HTTP, principalement utilisé pour interagir avec l'API backend.

### Electron et Déploiement
- **Electron** : Framework permettant de créer des applications de bureau multiplateformes en utilisant les technologies web.
- **Electron Builder** : Utilisé pour empaqueter et construire l'application pour différentes plateformes (Windows, Mac, Linux).

## Installation

### Prérequis

Avant de commencer, assure-toi d'avoir les outils suivants installés :
- **Node.js** (version 16 ou supérieure)
- **npm** (version 7 ou supérieure)

### Installation

1. Clone le projet :
   ```bash
   git clone https://github.com/Daarunia/todo-list
   cd todo-list
    ```
2. Installe les dépendances :
  ```bash
  npm install
  ```
3. Lance le serveur de développement :
 ```bash
  npm run dev
```
4. Pour lancer l'application en mode Electron (si tu veux tester en tant qu'application de bureau) :
 ```bash
  npm run electron:dev
```

### Build

Pour créer une version prête pour la production, utilise l'un des scripts de build suivants :

Pour la version Windows :
 ```bash
npm run build:win
```
Pour la version Mac :
 ```bash
npm run build:mac
```
Pour la version Linux :
 ```bash
npm run build:linux
```