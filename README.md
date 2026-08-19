# 🧟 Zombie Tower Defense 3D

Tower defense **entièrement en 3D** avec Three.js + Vite. Zéro ressource externe : tous les modèles 3D (9 tours, 3 types de zombies, 10 boss, maison, ~30 décors, structures de skins) sont générés à partir de primitives Three.js, et tous les sons sont synthétisés en WebAudio.

---

## 🚀 Démarrage rapide

```bash
npm install          # installe Vite + three
npm run dev          # serveur de dev (ex. http://localhost:5201/)
npm run build        # bundle de production dans dist/
npm run preview      # sert le build de production
```

`package.json` est en **ESM** (`"type": "module"`), Vite 8.x (base rolldown), Three.js récente.

---

## 🎮 Comment jouer

1. Choisissez une **difficulté** (écran « Jouer ») : 4 campagnes à durée finie + le mode **Infini**.
2. Placez des tours sur les emplacements valides autour du chemin. Les zombies suivent un **chemin en S** (12 points d'inflexion) jusqu'à votre maison.
3. Chaque fuitant blesse la base ; un **boss qui atteint la base = défaite immédiate** (voir « Fuites & boss »).
4. Les vagues se lancent toutes les **5 s** (bouton/`Espace` pour avancer, avec **bonus de 2 🪙/s restant**) — ou **immédiatement** après avoir acheté le ⚡ Mode Auto-Wave (10 000 🪙).
5. Vitesse du jeu : le bouton `Speed` du HUD cycle parmi les vitesses débloquées (**×1, ×2** par défaut ; **×4 = 5 000 🪙**, **×6 = 20 000 🪙** en Boutique).

**Économie entre les parties :** les pièces *gagnées pendant la partie* (kills, bonus) sont **mises de côté à la fin** (victoire **ou** défaite) et ajoutées à votre **cagnotte permanente**, qui s'utilise dans la Boutique. La cagnotte, les tours/skins/levels/vitesses achetés et les modes gagnés persistent entre les sessions (`localStorage`, clé `ztd_save_v1`).

### Contrôles
| Entrée | Action |
|---|---|
| `1` – `6` | choisir la tour (1 Gunner · 2 Frost · 3 Flame · 4 Sniper · 5 Mortar · 6 Mine ; les 3 autres se cliquent dans le panneau) |
| Clic gauche | placer la tour choisie · inspecter une tour · fermer le panneau en cliquant sur le vide |
| `U` / clic « Upgrader » | améliorer la tour sélectionnée (selon son plafond de niveau) |
| `S` / clic « Sell » | revendre la tour sélectionnée (**remboursement = 50 %** de l'investissement) |
| `Espace` | lancer la vague suivante en avance (+bonus) |
| `P` | pause / reprendre |
| `Échap` / clic droit | annuler le placement / fermer le panneau |

Le **fantôme de placement** suit la souris au-dessus du terrain : vert = place valide, rouge = invalide (trop près du chemin pour une tour normale — **les Mines doivent être proches du chemin**).

---

## 🕹️ Modes de difficulté (style TDS)

| Mode | Vagues | Carte | PV base | Pièces départ | Boss final | Bonus de victoire | Débloqué si… |
|---|---|---|---|---|---|---|---|
| **Débutant** | 25 | Cendres 🪨 (ashlands) | 40 | 350 | The Brute | +500 🪙 | par défaut |
| **Moyen** | 30 | Neige ❄️ (winter) | 40 | 280 | The Abomination | +1 000 🪙 | Débutant gagné |
| **Avancé** | 35 | Volcan 🌋 (volcanic) | 40 | 220 | The Titan | +2 500 🪙 | Moyen gagné |
| **Impossible** | 40 | Zone radioactive ☢️ (radio) | 35 | 180 | The Wraith | +5 000 🪙 | Avancé gagné |
| **∞ Infini** | sans fin | toutes les cartes, rotation toutes les 5 vagues | 40 | 200 | boss complet toutes les 10 vagues (cycle des 10) | — | toujours |

**Règles de vagues (modes finis)**
- Les vagues sont **générées** (`buildModeWaves` dans `src/config.js`) : composition croissante (walkers dès le départ, fasts dès la vague 3, tanks dès la vague 5) et PV en courbe linéaire + légère courbure quadratique propres à chaque mode.
- **Mini-boss toutes les 5 vagues** : un modèle de boss classique « réduit », tiré du pool du mode (ex. Moyen : Pyro Lord → Abomination → Stone Golem, en rotation).
- **Boss final** à la dernière vague — celui du mode (Brute / Abomination / Titan / Wraith).
- **Déverrouillage progressif** : gagner un mode l'enregistre dans la sauvegarde (`completed`) et débloque le suivant ; les cartes verrouillées sont grisées.
- **Mode Infini** : vagues générées à la volée, thèmes qui tournent en boucle, boss cycliques — pour se tester sans fin (pas de bonus de victoire, les pièces viennent des kills).

---

## 🗼 Les 9 tours

| Tour | Coût (en partie) | Disponible | Type | Stats niveau 1 | Rôle |
|---|---|---|---|---|---|
| **Gunner** | 50 | dès le départ | tir simple | 10 dég. · 0,5 s · portée 6 | Le couteau suisse du début de partie |
| **Frost** | 70 | Boutique — 5 000 🪙 | ralentissement | 10 dég. + gel 40 % (3 s) · 2 s · portée 7 | Étend la durée de vie de vos autres tours |
| **Flame** | 90 | Boutique — 5 000 🪙 | flammes continues | 30 DPS · portée 3,5 | Fond tout ce qui s'approche, en impasse |
| **Sniper** | 100 | dès le départ | tir lourd longue portée | 55 dég. · 1,8 s · portée 14 | Cueille les tanks et les gros PV |
| **Mortar** | 80 | Boutique — 3 000 🪙 | tir en cloche (éclat) | 40 dég. + éclat 2,5 · 1,6 s · portée 11 | Les groupes serrés |
| **Mine** | 30 | dès le départ | mine au sol | 45 dég. · rayon 2,2 | S'active au passage, se déplace après usage |
| **Électro** | 130 | Boutique — 6 000 🪙 | foudre en chaîne | 42 dég. + saute sur 2 cibles (60 %/35 %) · 1,15 s · portée 6,5 | ≈ 180 % de dégâts sur 3 zombies groupés |
| **Minigun** | 110 | Boutique — 4 500 🪙 | rafale rapide | 3,2 dég. · 0,085 s (≈ 38 DPS) · portée 7,5 | La reine des hordes |
| **Ferme** | 120 | Boutique — 7 000 🪙 | économie | +7 🪙 toutes les 6 s | Ne se défend pas — placez-la près de la maison |

**Niveaux (Lv1 → Lv5)**
- Le plafond de départ est **Lv2** pour chaque tour ; les paliers **Lv3 / Lv4 / Lv5** s'achètent dans la Boutique (« Niveaux avancés ») : **1 200 / 3 000 / 7 000 🪙** par tour (une case par niveau, or quand possédé).
- Chaque niveau multiplie dégâts/DPS par **×1,36** (douce courbe multiplicative), avec de petits bonus linéaires sur portée/cadence/éclat ; la **Ferme** voit son rendement augmenter à chaque niveau (7 → 11 → 14 → 18 → 21 🪙 / cycle).
- **Revente : 50 %** de l'investissement (coût de la tour + achats de niveaux).

---

## 🧟 Zombies, fuites & boss

### Les 3 types de zombies
| Type | PV | Vitesse | Récompense | Dégâts de fuite |
|---|---|---|---|---|
| **Walker** | 40 | 1,6 | 8 🪙 | 2 |
| **Fast** | 30 | 2,6 | 10 🪙 | 2 |
| **Tank** | 120 | 1,0 | 18 🪙 | 5 (armure 15 %) |

Les **skins par thème** modifient les stats de base : `snowy` (+15 % PV, 10 % armure, −10 % vitesse), `lava` (+10 % PV, 5 % armure), `dirty` (−5 % PV, +5 % vitesse), `water` (50 % résistance au ralentissement), `radiant` (+12 % PV, 8 % armure), `default` (neutre). La skin est imposée par le thème de la carte.

### Les 10 boss
Chaque boss a son **modèle 3D**, sa **PV/compensation** et sa **capacité** :

| Boss | PV | Vitesse | Récompense | Capacité |
|---|---|---|---|---|
| The Brute | 1 200 | 0,9 | 120 🪙 | fige les tours proches 3 s |
| The Stalker | 900 | 2,2 | 100 🪙 | se téléporte en avant + paralyse une tour 2 s |
| The Frost King | 1 100 | 1,1 | 110 🪙 | aura glaciale : engourdit les tours proches 3 s |
| The Pyro Lord | 1 300 | 1,0 | 130 🪙 | boules de feu directes vers la base |
| The Abomination | 2 000 | 0,7 | 200 🪙 | crache un petit zombie à chaque attaque |
| Stone Golem | 2 600 | 0,6 | 260 🪙 | piétifie les tours sous une coque de pierre (4 s) |
| The Sprinter | 2 200 | 1,4 | 240 🪙 | rafales de sprint (vitesse ×2) |
| The Regenerator | 2 400 | 1,0 | 250 🪙 | se régénère de 5 % de ses PV à chaque attaque |
| The Titan | 3 200 | 0,8 | 320 🪙 | onde de choc + **seconde vie** (revient à 50 %) |
| The Wraith | 2 800 | 1,2 | 300 🪙 | **phases** : vos projectiles le traversent parfois |

### Fuites & règle d'or
- Un zombie qui atteint la base retire ses **dégâts de fuite** (2/2/5 ci-dessus ; 8 à 16 pour les boss selon leur taille).
- 🚨 **Un boss qui atteint la maison = défaite instantanée**, quel que soit le PV restant — les boss (mini-boss compris) enfoncent la structure d'un seul coup.

---

## 🗺️ Cartes & thèmes

**Carte** : terrain 68 × 52 (le décor déborde au-delà de la zone constructible), chemin en S surélevé de 3,0 de large, zone de construction x ∈ [−24, 26], z ∈ [−14, 14]. Relief doux (collines sinusoïdales) aplati autour du chemin.

**Les 6 thèmes** (chaque thème = ciel/brume/sol/chemin + plusieurs dizaines de props 3D + skin de zombies) :

| # | Thème | Ambiance | Skin zombies |
|---|---|---|---|
| 0 | **suburb** | Banlieue : maisons, lampadaires, clôtures, puits, haies, fleurs | default |
| 1 | **winter** | Givré bleu-blanc, neige en permanence, monticules de neige, sapins blancs | snowy |
| 2 | **volcanic** | Terres brûlées, volcan actif à particules, pics rocheux, laves, cendres | lava |
| 3 | **ashlands** | Post-apo : brume grise, panneaux cassés, tombes, crânes, arbres morts, barils | dirty |
| 4 | **haunted** | Spectral bleu-vert : champignons bioluminescents, roseaux, ruines, ossements | water |
| 5 | **radio** | ☢️ Dôme de confinement fêlé, barils de déchets, marquages jaune/noir, flore mutante | radiant |

En **modes finis**, la partie reste sur SA carte dédiée (Cendres / Neige / Volcan / Radio). En **Infini**, le thème **rotate toutes les 5 vagues** (modulo `(vague−1)/5`).

~30 types de props 3D différents (sapins, rochers, crânes de zombie, arbres morts noués, barils rouillés, réacteurs, laves, neige…) dispersés avec anti-collision (`scatterProps` dans `src/game.js`).

---

## 💰 Économie & Boutique

**Pendant la partie** : récompense par kill (8/10/18 🪙), bonus d'avance de vague (+2 🪙/s restant), revenus de la Ferme. À la fin (victoire **ou** game over), l'ensemble des pièces gagnées est **mémorisé dans la cagnotte permanente** — plus le mode est difficile, plus la victoire rapporte (voir le tableau des modes).

### Boutique — catalogue complet
| Catégorie | Items | Prix 🪙 |
|---|---|---|
| Tours (débloquage) | Frost · Flame · Mortar · Électro · Minigun · Ferme | 5 000 · 5 000 · 3 000 · 6 000 · 4 500 · 7 000 |
| Niveaux avancés (par tour possédé) | Lv3 · Lv4 · Lv5 | 1 200 · 3 000 · 7 000 |
| Skins de tours | Or Sacré · Acier Fantôme · Cœur de Magma | 1 200 · 1 500 · 1 800 |
| Skins de maison | Maison Enchantée · Château de Cristal · Manoir Hanté | 2 500 · 3 000 · 2 000 |
| ⚡ Vitesse | ×4 · ×6 | 5 000 · 20 000 |
| ⚡ Mode Auto-Wave | vagues enchaînées sans délai (bouton Auto du HUD) | 10 000 |

Les aperçus 3D de la Boutique, de l'Inventaire et des panneaux de tour sont des **rendus offscreen temps réel** du vrai modèle 3D (`Ui._pvImg`, scène Three.js hors écran avec caméra auto-cadrée sur la bounding box).

---

## 🎨 Skins & structures 3D

- **Skins de tours** : teinte + finitions PBR (metalness/roughness/opacity) **et décorations géométriques distinctives** (`buildSkinDecor` dans `src/assets.js`) — bagues dorées, éclats de cristal, braises de magma…
- **Skins de maison** : `buildBaseSkinDecor` construit de **vraies structures** autour de la demeure (coordonnées absolues, 1 unité = 1 m) :
  - *Maison Enchantée* : cercle de 8 menhirs runiques, sigile lumineux au sol, cristal arcanique sur le faîtage, runes en lévitation.
  - *Château de Cristal* : plateforme de glace, muraille de 9 pics de cristal, grand cristal royal sur le toit.
  - *Manoir Hanté* : tombeaux penchés, arbre mort, 4 spectres flottants, brume verte, lanterne courbée.
- **Favicon** : `public/favicon.svg` (tête de zombie au-dessus du toit), branché dans `index.html`.

---

## ⚙️ Paramètres (menu principal)

Panneau dédié : **Particules** (Faible / Moyen / Max), **Cadavres visibles simultanés** (5 / 10 / 20 / 40 / 80), **Son** (on/off), et le **reset de progression** (efface la sauvegarde après confirmation).

## 🔊 Audio

100 % synthétisé en WebAudio (zéro asset) : tirs distincts par tour, impacts, morts, placements, achats, alarme de vague, coup à la base, fanfare de victoire et glissando de défaite. Throttlé (< 1 son / 55 ms) et coupable dans les Paramètres.

---

## 🏗️ Architecture du code

```
index.html          Structure du HUD + overlay plein écran (menu/boutique/inventaire/pause…) + favicon
src/main.js         Bootstrap 3D : renderer (ACES, PCFSoft shadows, pixelRatio ≤1.75), caméra orbitale,
                    boucle RAF (delta clampé ≤0.1 s), exposition des handles de test (window.__game, __CONFIG, __terrainHeight)
src/scene.js        Scène, lumières, relief sinusoïdal aplati près du chemin, ruban du chemin (Catmull-Rom
                    centripetal, DoubleSide), props thématiques (scatterProps), maison (createBaseModel)
src/path.js         Waypoints (12) + échantillonnage du spline pour collision / placement
src/config.js       Source de vérité : 9 tours, 3 zombies, 10 boss, 6 thèmes (props), 5 modes
                    (DIFFICULTIES, buildModeWaves, buildInfiniteWave), courbes d'HP, prix…
src/entities.js     Tower (ciblage first/strongest/nearest/closer/farther, zap en chaîne, ferme, mine,
                    pétification/gel), Zombie (skins, barres de PV, mort en deux temps), Projectile
src/vfx.js          Particules (mort/éclats/givre/laves), screen shake, flash de base, bursts de pièces
src/ui.js           Toute l'interface DOM : menu, écran Difficulté (cartes + miniatures 3D), Boutique,
                    Inventaire (détails, catalogue monstres), Paramètres, panneau de tour, bannières,
                    rendu offscreen des aperçus (_pvImg / _modelFor / _shot)
src/input.js        Souris (fantôme de placement, sélection), clavier (1–6, Espace, U, S, P, Échap)
src/game.js         Game loop : états (MENU/PLAYING/PAUSED/GAMEOVER/WIN), modes & vagues, thèmes,
                    économie (bonus d'avance, bank de pièces, refund 50 %), boss & capacités, achats
src/save.js         loadSave/persistSave (localStorage ztd_save_v1), DEFAULT_SAVE, catalogue SHOP
src/sound.js        Synthèse WebAudio (lazy AudioContext, throttle)
src/style.css       Thème sombre + styles de tous les écrans
public/favicon.svg  Icône du navigateur
```

**Détails d'implémentation notables**
- Les **matériaux ne sont jamais partagés globalement** (mutations par instance : teintes de skins, opacité du wraith, glow du petrify) ; seul le cache de géométries est partagé (`_geoCache`).
- Performance : pas de PointLight par projectile (glow émissive), pixelRatio borné, delta clampé, `frustumCulled=false` sur les éléments critiques.
- `window.__game`, `window.__CONFIG`, `window.__terrainHeight` sont exposés pour les scripts de test Puppeteer.

---

## 🧪 Tests automatisés

Puppeteer-core headless (Chrome existant) avec drapeaux WebGL logiciels : `--use-gl=angle --use-angle=swiftshader`. Les scripts `_*.cjs` (menu, placement, boutique, skins, modes, régressions de boutons…) vérifient l'absence d'erreurs console et le comportement des mécaniques ; le build de production doit rester propre (`npm run build`).

---

## 📐 Notes de design

- **Tout est procédural** : zéro modèle, son ou texture externe — le projet tient dans le navigateur sans aucun asset.
- L'équilibrage repose sur des **courbes multiplicitives douces** (dégâts ×1,36/niveau, PV de vagues linéaires + quadratique légère) plutôt que des bonus additifs.
- Les modes finis ont chacun **leur carte dédiée** ; l'Infini fait vivre les 6 thèmes.
- Les upgrades de tours restent achetables **par tour type** (plafonds individuels) — on n'achète jamais de niveaux inutiles.

---

## 📜 Journal des ajouts

- **Bouton « ← Retour au menu » unifié** sur les 4 écrans du menu (haut à gauche, même pilule) + **corrections de boutons morts** (bouton Skins du détail tour après changement de niveau ; bouton « Resume » fantôme après « ✕ Quitter »).
- **Cartes plus denses** : 3 nouveaux props 3D (crâne, arbre mort noué, baril rouillé) + dizaines de props supplémentaires par thème ; **skins de maison devenus de vraies structures 3D** (menhirs, pics de glace, tombeaux) ; **favicon** navigateur.
- **Règle d'or** : un boss à la base = défaite instantanée (mini-boss compris).
- **Sons** WebAudio complets (tirs par tour, alarmes, fanfares) + **Paramètres** (particules, cadavres, son, reset) ; **équilibrage v2** (courbes adoucies, tours Lv5 compétitives).
- **6e thème** ☢️ (dôme, barils, plots jaune/noir, flore mutante) + props enrichis ashlands/haunted.
- **Skins de tours avec géométries distinctives** + **aperçus 3D réels** (boutique, inventaire, panneaux) via renderer offscreen.
- **Modes de difficulté TDS** : 4 campagnes (25/30/35/40 vagues) + Infini, cartes dédiées, mini-boss toutes les 5 vagues, boss final par mode, **déverrouillage progressif persistant**, bonus de victoire (500→5 000 🪙).
- **3 nouvelles tours** (Électro, Minigun, Ferme) → 9 au total ; **vitesse ×4/×6** et **Mode Auto-Wave** achetables ; carte agrandie 68×52 avec chemin en S.
