# Recherche globale du board

Une barre unique dans le header remplace le filtre par tag (`MultiSelect` de `Home.vue`). Elle filtre le board par texte (titre et description) et par tags, et propose des raccourcis vers les tags et les tâches.

## 1. Placement

- Champ centré dans le header, entre le logo et les boutons (thème, palette, paramètres). Largeur max ~480 px, se réduit si la fenêtre est étroite.
- Visible uniquement sur le board (route Home), masqué sur Paramètres et Archives.
- La ligne du filtre actuel dans `Home.vue` est supprimée : le board gagne cette hauteur.
- Placeholder : « Rechercher… (# pour un tag) ». Indication `Ctrl F` à droite quand le champ est vide.
- Bouton × à droite pour tout effacer, visible seulement si un filtre est actif.

## 2. Saisie

Le champ contient des chips de tags suivies du texte libre.

| Action                           | Effet                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Texte libre                      | Filtre le board **en direct** (délai ~150 ms) et ouvre la liste de suggestions mixte |
| `#` puis des lettres             | La liste n'affiche que la section Tags                                               |
| Choix d'un tag                   | Le tag devient une chip, le texte tapé est effacé                                    |
| Retour arrière sur un texte vide | Supprime la dernière chip                                                            |
| × sur une chip                   | Retire ce tag                                                                        |
| `Échap`                          | Ferme la liste ; un second appui vide tout et retire le focus                        |
| `Ctrl+F` / `Cmd+F`               | Focus dans la barre depuis le board                                                  |

## 3. Liste de suggestions

Ouverte dès qu'un texte est saisi, navigation au clavier (↑ ↓, `Entrée`, `Échap`). Partie correspondante surlignée.

1. **Rechercher « … » dans les tâches** : sélectionnée par défaut. `Entrée` ferme la liste et garde le filtre texte.
2. **Tags** : tags dont le nom contient le texte (insensible à la casse et aux accents), parmi ceux portés par au moins une tâche active (logique actuelle de `filterOptions`), triés par nom, affichés avec `TagChip`. Les tags déjà sélectionnés sont exclus. Choisir un tag le transforme en chip.
3. **Tâches · N** : cartes visibles correspondant au texte (et aux tags sélectionnés), 5 au maximum. Titre, extrait de la description si la correspondance y est, colonne à droite. Choisir une tâche ouvre son `TaskDialog`.

Avec `#`, seule la section Tags est affichée. Sections vides masquées.

## 4. Règles de filtrage

- **Texte** : insensible à la casse et aux accents (`tâche` = `tache`). Plusieurs mots : une tâche doit tous les contenir, dans le titre ou la description.
- **Description** : recherche sur le texte brut, sans la syntaxe Markdown.
- **Tags** : OU entre les tags (comme aujourd'hui).
- **Texte + tags** : ET.

## 5. Comportements du board

Déclenchés dès qu'un filtre est actif (texte ou tag) :

- drag & drop désactivé (`filterActive`), message `filterDndHint` en infobulle sur la barre ;
- message `filterNoMatch` si aucune tâche ne correspond ;
- compteurs des colonnes au format **visibles/total** (« 1/3 ») ; total seul sans filtre ;
- une nouvelle tâche hérite des tags du filtre (`filterTagSelection`), pas du texte.

## 6. Mémorisation

Le réglage « mémoriser le filtre de tags » ne mémorise que les tags (`tagFilterIds`). Le texte est vidé au redémarrage.

## 7. Architecture

- **Store Pinia `BoardFilter`** : état `query`, `tagIds` ; getters `terms` (normalisés), `isActive`, `matches(task)` ; restauration et sauvegarde du filtre mémorisé (déplacées depuis `Home.vue`). Nécessaire car le header et `Home` sont frères.
- **Composant `BoardSearch.vue`** : champ, chips et liste de suggestions, monté dans `Header.vue`.
- **Utilitaire de normalisation** (minuscules, suppression des accents via `normalize('NFD')`, Markdown retiré) partagé entre filtre et suggestions.
- **`Kanban.vue`** : la prop `filterTagIds` est remplacée par le store ; `visibleTaskLists` utilise `boardFilter.matches(task)` ; ouverture d'une tâche exposée pour la section Tâches.
- **`StageTaskList.vue`** : compteur visibles/total.
- **i18n** : clés du placeholder, des sections, de l'option de recherche texte, du bouton effacer ; nettoyage des clés `board.filter*` dans les 5 langues.

## 8. Tests

- **Unitaires** (`BoardFilter`, normalisation) : accents et casse, mots multiples, texte + tags, Markdown ignoré.
- **E2E** : migration des specs utilisant `data-testid="tag-filter"`. Nouveaux cas : tag via `#` et sans `#`, ouverture d'une tâche depuis la liste, recherche dans la description, `Ctrl+F` et `Échap`, drag désactivé pendant une recherche texte, compteurs « x/y », filtre de tags mémorisé après redémarrage.

## Hors périmètre

- Surlignage des correspondances dans les cartes du board.
- Recherche dans les Archives.
- Syntaxe avancée (`-tag`, `"phrase exacte"`, `version:`).
