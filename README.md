# 🧟 Zombie Tower Defense 3D

> **Un tower defense 100 % en 3D, zéro asset externe.**
> Tous les modèles 3D (11 tours, 3 types de zombies + squelettes, 10 boss, la maison, ~35 types de décors, les structures de skins) sont construits à la main à partir de primitives Three.js, et **tous les sons sont synthétisés en WebAudio** (aucun fichier audio). Le jeu tient entièrement dans le navigateur.

**Moteur** : Three.js + Vite 8.x (rolldown) · **Type** : ESM (`"type": "module"`) · **Dépendances** : `three` uniquement.

---

## 📑 Sommaire

1. [🚀 Démarrage rapide](#-démarrage-rapide)
2. [🎮 Comment jouer](#-comment-jouer)
3. [🕹️ Modes de difficulté (style TDS)](#-modes-de-difficulté-style-tds)
4. [🗼 Les 11 tours (stats détaillées)](#-les-11-tours)
5. [🧟 Zombies, squelettes, fuites & boss](#-zombies-squelettes-fuites--boss)
6. [🗺️ Cartes, thèmes & décors](#-cartes-thèmes--décors)
7. [💰 Économie & Boutique](#-économie--boutique)
8. [🎨 Skins & structures 3D](#-skins--structures-3d)
9. [⚙️ Paramètres & sauvegarde (progress.json)](#-paramètres--sauvegarde)
10. [🔊 Audio](#-audio)
11. [⏱️ Vitesses & horloge de jeu](#-vitesses--horloge-de-jeu)
12. [🏗️ Architecture du code](#-architecture-du-code)
13. [🧪 Tests automatisés](#-tests-automatisés)
14. [📐 Notes de design](#-notes-de-design)
15. [📜 Journal des ajouts](#-journal-des-ajouts)
16. [🚀 Release v0.1.1](#-release-v011)

---

## 🚀 Démarrage rapide

```bash
npm install          # installe Vite + three
npm run dev          # serveur de dev (http://localhost:5201/)
npm run build        # bundle de production dans dist/
npm run preview      # sert le build de production
```

| Script | Rôle |
|---|---|
| `npm run dev` | Vite dev-server (port **5201**), HMR activé |
| `npm run build` | Build optimisé (rolldown) → `dist/` |
| `npm run preview` | Sert `dist/` en local |

**Exigences** : Node 18+, un navigateur WebGL (Chrome/Edge/Chromium pour la File System Access API ; Safari/Firefox supportés via le fallback Export/Import de la sauvegarde).

**Icône du navigateur** : `public/favicon.svg` (tête de zombie au-dessus d'un toit), branché dans `index.html`.

---

## 🎮 Comment jouer

### Boucle de jeu
1. **Choisir une difficulté** (écran « Jouer ») : 4 campagnes à durée finie (Débutant → Impossible, déverrouillage progressif) + le mode **∞ Infini**.
2. **Placer des tours** sur les emplacements valides autour du chemin. Les zombies suivent un **chemin en S** (12 points d'inflexion) de l'ouest jusqu'à votre maison (sud-est).
3. **Encaisser les vagues** : chaque fuyant qui atteint la base lui retire ses dégâts de fuite.
4. 🚨 **Règle d'or** : un **boss** (final **ou** mini-boss) qui atteint la maison = **défaite immédiate**, quelle que soit la base restante.
5. **Gagner** la campagne (tout les vagues tenues) → **bonus de mode** (500 → 5 000 🪙) + les pièces de la partie sont **mémorisées dans la cagnotte permanente** pour la Boutique.

### Entre les parties
Les pièces **gagnées pendant la partie** (kills, bonus d'avance, Ferme) sont **mises de côté à la fin** (victoire **ou** défaite) et ajoutées à votre **cagnotte permanente**, utilisée dans la Boutique. Persistent entre sessions : cagnotte, tours/débloquages, niveaux avancés, skins, vitesses, modes gagnés, équipement (loadout).

### Contrôles
| Entrée | Action |
|---|---|
| `1` – `6` | choisir la tour (1 Gunner · 2 Frost · 3 Flame · 4 Sniper · 5 Mortar · 6 Mine ; les 5 autres se cliquent dans le panneau) |
| Clic gauche | placer la tour choisie · inspecter une tour · fermer le panneau en cliquant sur le vide |
| `U` / clic « Upgrader » | améliorer la tour sélectionnée (selon son plafond de niveau) |
| `S` / clic « Sell » | revendre la tour sélectionnée (**remboursement = 50 %** de l'investissement) |
| `Espace` | lancer la vague suivante en avance (**+2 🪙/s restant**) |
| `P` | pause / reprendre |
| `Échap` / clic droit | annuler le placement / fermer le panneau |
| Bouton `Speed` (HUD) | cycler les vitesses débloquées (×1 → ×2 → ×4 → ×6) |
| Bouton `⚡ Auto` (HUD) | enchaîner les vagues sans délai (nécessite le **Mode Auto-Wave** de la Boutique) |

### Fantôme de placement
Le **fantôme** suit la souris au-dessus du terrain : **vert** = place valide, **rouge** = invalide.
- Les **tours classiques** doivent être **loin** du chemin (clearance ≥ 1,2 u) — mais pas trop loin pour rester utiles.
- Les **Mines** doivent être **proches** du chemin (≤ 4,5 u).
- Les **Barricades** doivent être **sur** le chemin (≤ 1,5 u du centre) — elles sont les seules à exiger le chemin.
- Les **Nécromants** et la **Ferme** ont une empreinte, pas de portée d'attaque.

### Limites de tours
- **Par type** (posées simultanément) : Gunner 15 · Sniper 5 · Mine 10 · Frost 6 · Flame 4 · Mortar 5 · Électro 3 · Minigun 4 · Ferme 3 · Barricade 12 · Nécromant 3.
- **Par mode** (total, toutes tours confondues) : Débutant **30** · Moyen **25** · Avancé **20** · Impossible **15** · Infini **30**.
- HUD : compteur « TOURS x / max » + badge **MAX** sur la carte de placement quand une limite est atteinte.

---

## 🕹️ Modes de difficulté (style TDS)

| Mode | Vagues | Carte | PV base | Pièces départ | Tours max | Boss final | Bonus victoire | Débloqué si… |
|---|---|---|---|---|---|---|---|---|
| **Débutant** | 25 | Cendres 🪨 (ashlands) | 40 | 350 | 30 | The Brute | +500 🪙 | par défaut |
| **Moyen** | 30 | Neige ❄️ (winter) | 40 | 280 | 25 | The Abomination | +1 000 🪙 | Débutant gagné |
| **Avancé** | 35 | Volcan 🌋 (volcanic) | 40 | 220 | 20 | The Titan | +2 500 🪙 | Moyen gagné |
| **Impossible** | 40 | Zone radioactive ☢️ (radio) | 35 | 180 | 15 | The Wraith | +5 000 🪙 | Avancé gagné |
| **∞ Infini** | sans fin | toutes les cartes (rotation /5 vagues) | 40 | 200 | 30 | boss complet /10 vagues (cycle des 10) | — | toujours |

### Génération des vagues (`buildModeWaves` — `src/config.js`)
- **PV** = courbe douce : `1 + hpK₀·(w−1) + hpK₁·(w−1)²` (linéaire + légère courbure quadratique), propre à chaque mode.
- **Vitesse** = `min(1,8, 1 + spK·(w−1))` (monte doucement, plafonnée).
- **Composition croissante** :
  - Walkers dès la vague 1 : `3 + w` (plafonné, × échelle du mode).
  - Fasts dès la vague 3 : `w·0,6`.
  - Tanks dès la vague 5 : `w·0,35`.
- **Mini-boss toutes les 5 vagues** : un boss « réduit » tiré du **pool du mode** (rotation). Il inflige **la moitié des PV de la base** à l'arrivée **sans** tuer instantanément.
- **Boss final** à la dernière vague (celui du mode).
- **Échelle des PV par mode** (multiplicateurs walker/fast/tank) : Débutant 0,7 / Moyen 0,85 / Avancé 1,0 / Impossible 1,25.

**Pools de mini-boss par mode**
| Mode | Pool (rotation des vagues 5,10,15…) |
|---|---|
| Débutant | Stalker · Frost King |
| Moyen | Pyro Lord · Abomination · Stone Golem |
| Avancé | Sprinter · Regenerator · Titan |
| Impossible | Wraith · Titan · Regenerator · Stone Golem |

**Mode ∞ Infini** : vagues fabriquées à la volée (`buildInfiniteWave`), thèmes qui tournent toutes les 5 vagues, **boss complet toutes les 10 vagues** (cycle des 10). Pas de bonus de victoire — les pièces viennent des kills.

**Déverrouillage progressif** : gagner un mode l'enregistre dans la sauvegarde (`completed`) et débloque le suivant ; les cartes verrouillées sont grisées avec le prérequis affiché.

---

## 🗼 Les 11 tours

### Vue d'ensemble
| Tour | Coût (partie) | Disponible | Type | Stats Lv1 | Rôle |
|---|---|---|---|---|---|
| **Gunner** | 50 | départ | tir simple | 10 dég · 0,5 s · portée 6 | Couteau suisse du début |
| **Frost** | 70 | Boutique 5 000 🪙 | gel/ralentissement | 10 dég + gel 40 % (3 s) · 2 s · portée 7 | Étend la vie des autres tours |
| **Flame** | 90 | Boutique 5 000 🪙 | flammes continues | 30 DPS · portée 3,5 | Fond tout à courte portée |
| **Sniper** | 100 | départ | tir lourd longue portée | 55 dég · 1,8 s · portée 14 | Cueille les tanks |
| **Mortar** | 80 | Boutique 3 000 🪙 | tir en cloche (éclat) | 40 dég + éclat 2,5 · 1,6 s · portée 11 | Les groupes serrés |
| **Mine** | 30 | départ | mine au sol | 45 dég · rayon 2,2 | S'active au passage, se déplace après |
| **Électro** | 130 | Boutique 6 000 🪙 | foudre en chaîne | 42 dég + saute 2 cibles (60 %/35 %) · 1,15 s · portée 6,5 | ≈ 180 % sur 3 groupés |
| **Minigun** | 110 | Boutique 4 500 🪙 | rafale rapide | 3,2 dég · 0,085 s (≈ 38 DPS) · portée 7,5 | La reine des hordes |
| **Ferme** | 120 | Boutique 7 000 🪙 | économie | +7 🪙 / 6 s | Ne se défend pas — près de la maison |
| **Barricade** | 40 | Boutique 2 000 🪙 | **posée SUR le chemin** | 500 PV · soin lent | Mur : les mobs bloqués la grignotent (dégâts = leurs PV/s) |
| **Nécromant** | 150 | Boutique 8 000 🪙 | **ressuscite les tués** | squelette 20 % PV · cd 8 s · 3 max | Fait ressortir ses kills en squelettes barrières |

### Stats détaillées (Lv1 → Lv5)
Formules (détail dans [Architecture](#-architecture-du-code)) :
- **Dégâts/DPS** = `base × 1,36^(niveau−1)` (arrondi).
- **Portée/éclat/rayon/ralentissement** = base + bonus linéaire par niveau.
- **Cadence** = base + bonus (négatif = plus rapide).

| Tour | Dégâts (Lv1→5) | Cadence (s) | Portée | Bonus par niveau |
|---|---|---|---|---|
| **Gunner** | 10 / 14 / 18 / 25 / 34 | 0,50 / 0,46 / 0,42 / 0,38 / 0,34 | 6,0→7,6 | +portée, +cadence |
| **Sniper** | 55 / 75 / 102 / 138 / 188 | 1,80 / 1,68 / 1,56 / 1,44 / 1,32 | 14,0→17,2 | +portée, +cadence |
| **Frost** | 10 / 14 / 18 / 25 / 34 | 2,00 fixe | 7,0→9,8 | gel 40→64 % (cap 68 %) |
| **Flame** | 30 / 41 / 55 / 75 / 103 (DPS) | continu | 3,5→4,7 | +DPS, +portée |
| **Mortar** | 40 / 54 / 74 / 101 / 137 | 1,60 fixe | 11,0→14,2 | éclat 2,5→3,7 |
| **Électro** | 42 / 57 / 78 / 106 / 144 | 1,15 / 1,07 / 0,99 / 0,91 / 0,83 | 6,5→8,1 | **chaînes 2 / 3 / 3 / 4 / 4** |
| **Minigun** | 3 / 4 / 6 / 8 / 11 (par balle) | 0,085 fixe | 7,5 | +dégâts/balle |
| **Mine** | 45 / 61 / 83 / 113 / 154 | — (à l'impact) | rayon 2,2→3,2 | +dégâts, +rayon |
| **Ferme** | — (économie) | 6 s / cycle | — | revenu 7 / 11 / 14 / 18 / 21 🪙 |
| **Barricade** | — (PV) | — | — | **PV 500 / 850 / 1 200 / 1 550 / 1 900** |
| **Nécromant** | — (soutien) | cd 8 / 7 / 6 / 5 / 4 s | — | **% squelette 20 / 31 / 43 / 54 / 65** |

### Mécaniques spécifiques
- **Gunner / Sniper / Minigun** (tir simple) : projectile physique (balle / traceur). Le Sniper a une balle quasi instantanée (vitesse 90).
- **Frost** : lance une balle de glace → **gel** (ralentissement) + dégâts. Le gel est **visible** (teinte glace `#63C8FF` sur la tour cible, restauré à la fonte). Ralentissement plafonné à **68 %**.
- **Flame** : jet continu (dégâts par trame), très courte portée — à placer en impasse.
- **Mortar** : balle lente en cloche (vitesse 12) avec **dégâts d'éclat** autour de l'impact.
- **Mine** : se déclenche au passage d'un zombie, inflige ses dégâts, puis **se déplace** pour se repositionner.
- **Électro** : coup d'éclair **instantané** qui **saute** entre cibles (dégâts décroissants 100 % / 60 % / 35 % / 20 %). Le nombre de **chaînes augmente avec le niveau** (point 8) : 2 en Lv1 → **4 en Lv5**.
- **Ferme** : génère des pièces toutes les 6 s. Ne se défend pas — à protéger.
- **Barricade** (nouveauté) : posée **sur le chemin**. Un zombie qui arrive dessus se cale et **grignote** la barricade en infligeant un montant = **ses PV / seconde** ; la barricade se **soigne lentement**. Quand elle tombe, le chemin est de nouveau libre. C'est un **mur éphémère** pour gagner du temps.
- **Nécromant** (nouveauté) : dans son empreinte, il **vole les kills** (zombies tués ou fuyants) et, à intervalle régulier, **ressuscite un squelette** près de la base. Le squelette marche **dans le sens inverse** (vers l'entrée) pour aller au-devant de la horde et **se sacrifie** (ses dégâts = ses PV). **3 Nécromants max** posés, **3 squelettes vivants max par Nécromant**.

### Niveaux (Lv1 → Lv5)
- Plafond de départ : **Lv2** pour chaque tour. Les paliers **Lv3 / Lv4 / Lv5** s'achètent dans la Boutique (« Niveaux avancés »), **par type de tour** : **1 200 / 3 000 / 7 000 🪙** (séquentiel : Lv3 avant Lv4, Lv4 avant Lv5).
- Chaque niveau : dégâts/DPS **×1,36** + petits bonus linéaires (portée/cadence/éclat/gel/chaînes/rendement).
- **Coût d'amélioration en partie** (bouton Upgrader) : `coût de la tour × (0,6 + niveau × 0,25)` — limité par le plafond.
- **Revente** : **50 %** de l'investissement (coût de la tour + achats de niveaux).

### Équipement (loadout) — max 5 tours à la fois
- Une tour **achetée en Boutique n'est PAS équipée par défaut** : il faut l'équiper dans l'**Inventaire** pour pouvoir la jouer.
- **5 tours équipées max** (`equippedTowers`). Le panneau de placement ne montre que les tours équipées.
- Badges « ⚔ Équipée / Non équipée » + bouton « Équiper / Déséquiper » (feedback « Équipage plein 5/5 »).
- Se combine avec les caps de pose (par type + par mode).

---

## 🧟 Zombies, squelettes, fuites & boss

### Les 3 types de base
| Type | PV | Vitesse | Récompense | Dégâts de fuite | Armure |
|---|---|---|---|---|---|
| **Walker** | 40 | 1,6 | 8 🪙 | 2 | 0 |
| **Fast** | 30 | 2,6 | 10 🪙 | 2 | 0 |
| **Tank** | 120 | 1,0 | 18 🪙 | 5 | 15 % |

Les PV/vitesse sont ensuite **mis à l'échelle par la vague** (courbe du mode) et par la **skin du thème**.

### Skins de zombies (imposées par le thème de la carte)
| Skin | PV | Vitesse | Armure | Résist. ralent. | Thème |
|---|---|---|---|---|---|
| **default** | ×1,00 | ×1,00 | +0 % | +0 % | suburb |
| **snowy** | ×1,15 | ×0,90 | +10 % | +10 % | winter |
| **lava** | ×1,10 | ×0,95 | +5 % | +0 % | volcanic |
| **dirty** | ×0,95 | ×1,05 | +0 % | +0 % | ashlands |
| **water** | ×1,05 | ×1,10 | +0 % | **+50 %** | haunted |
| **radiant** | ×1,12 | ×1,05 | +8 % | +5 % | radio |

### Le Squelette (troupe du Nécromant)
- Entité `kind:'skeleton'` : **pas de fuite** (n'atteint jamais la base), `reward 0`, invulnérable au gel.
- **PV** = % des PV du monstre source (20 % Lv1 → 65 % Lv5), **dégâts = ses PV** (se sacrifie), meurt en **1 frappe**.
- Marche **en sens inverse** (`progress` décroît) depuis la base vers l'entrée, pour intercepter la horde.
- Ne grignote pas les barricades.

### Fuites & règle d'or
- Un zombie qui atteint la base retire ses **dégâts de fuite** (2 / 2 / 5 ; 8 à 16 pour les boss selon leur taille).
- 🚨 **Un boss (final ou mini) qui atteint la maison = défaite instantanée** — il enfoncé la structure d'un seul coup, même si la base est à 40/40 PV.

### Les 10 boss
Chaque boss a son **modèle 3D** distinct, ses **PV** et sa **capacité** :

| Boss | PV | Vitesse | Récompense | Dég. fuite | Capacité |
|---|---|---|---|---|---|
| **The Brute** | 1 200 | 0,9 | 120 🪙 | 8 | fige les tours proches 3 s |
| **The Stalker** | 900 | 2,2 | 100 🪙 | 8 | se téléporte en avant + paralyse une tour 2 s |
| **The Frost King** | 1 100 | 1,1 | 110 🪙 | 8 | aura glaciale : engourdit les tours proches 3 s (gel **visible** `#63C8FF`) |
| **The Pyro Lord** | 1 300 | 1,0 | 130 🪙 | 10 | boules de feu vers la base (1 boule / 5 s, 5 dég, délai 5 s au spawn) |
| **The Abomination** | 2 000 | 0,7 | 200 🪙 | 12 | crache un petit zombie à chaque attaque |
| **Stone Golem** | 2 600 | 0,6 | 260 🪙 | 14 | piétifie les tours sous une coque de pierre (4 s) |
| **The Sprinter** | 2 200 | 1,4 | 240 🪙 | 12 | rafales de sprint (vitesse ×2) |
| **The Regenerator** | 2 400 | 1,0 | 250 🪙 | 12 | se régénère de 5 % de ses PV à chaque attaque |
| **The Titan** | 3 200 | 0,8 | 320 🪙 | 16 | onde de choc + **seconde vie** (revient à 50 %) |
| **The Wraith** | 2 800 | 1,2 | 300 🪙 | 14 | **phasing** : vos projectiles le traversent parfois |

**Mini-boss** : mêmes modèles « réduits » — mêmes capacités, PV réduits, et **dégâts de fuite = baseHP/2** (ne tue pas la partie).

---

## 🗺️ Cartes, thèmes & décors

**Carte** : terrain **68 × 52** (le décor déborde au-delà de la zone constructible), **chemin en S** surélevé de **3,0** de large, zone de construction **x ∈ [−24, 26], z ∈ [−14, 14]**. Relief doux (collines sinusoïdales) **aplati autour du chemin** pour garder le ruban de marche à plat.

**Les 6 thèmes** (chaque thème = ciel/brume/sol/chemin + dizaines de props + skin de zombies) :

| # | Thème | Ambiance | Skin | Props signature |
|---|---|---|---|---|
| 0 | **suburb** | Banlieue verte, nuit douce | default | arbres, lampadaires, clôtures, puits, haies, fleurs, barils, herbe, crânes |
| 1 | **winter** | Givré bleu-blanc, neige en permanence | snowy | monticules de neige, sapins givrés, rochers, arbres morts, herbe gelée |
| 2 | **volcanic** | Terres brûlées, **volcan actif à particules** | lava | pics de lave (rockspire), laves, cendres, gros rochers, boulders |
| 3 | **ashlands** | Post-apo, brume grise | dirty | panneaux cassés, tombes, crânes, arbres morts noués, barils, broussailles |
| 4 | **haunted** | Spectral bleu-vert, brume | water | champignons bioluminescents, roseaux, ruines, ossements, plantes radioactives |
| 5 | **radio** | ☢️ Dôme de confinement fêlé | radiant | **réacteurs**, barils de déchets, marquages jaune/noir, flore mutante, boulders |

**~35 types de props 3D** différents (sapins, rochers, crânes de zombie, arbres morts noués, barils rouillés, réacteurs, laves, neige, fleurs, herbe, puits, charrettes, palettes, clôtures, lampadaires, tombes, buissons, souches, bûches, haies, champignons, monticules de neige, pics rocheux, cendres, boulders, plantes mutantes, marquages, roseaux, ossements…). Ils sont dispersés avec **anti-collision** (`scatterProps` — `src/game.js`).

**Rotation des thèmes** : en **modes finis**, la partie reste sur SA carte dédiée (Cendres / Neige / Volcan / Radio). En **∞ Infini**, le thème **rotate toutes les 5 vagues** (modulo `(vague−1)/5` sur les 6 thèmes).

---

## 💰 Économie & Boutique

### Pendant la partie
- **Récompense par kill** : Walker 8 🪙 · Fast 10 🪙 · Tank 18 🪙.
- **Bonus d'avance de vague** : +2 🪙 / seconde restant quand on lance une vague en avance.
- **Revenus de la Ferme** : toutes les 6 s.
- À la fin (victoire **ou** défaite), les pièces gagnées de la partie sont **mémorisées dans la cagnotte permanente** ; le **bonus du mode** (500→5 000 🪙) est ajouté en cas de victoire.

### Boutique — catalogue complet
| Catégorie | Items | Prix 🪙 |
|---|---|---|
| **Tours** (débloquage) | Frost · Flame · Mortar · Électro · Minigun · Ferme · **Barricade** · **Nécromant** | 5 000 · 5 000 · 3 000 · 6 000 · 4 500 · 7 000 · **2 000** · **8 000** |
| **Niveaux avancés** (par tour possédé, séquentiel) | Lv3 · Lv4 · Lv5 | 1 200 · 3 000 · 7 000 |
| **Skins de tours** | Or Sacré · Acier Fantôme · Cœur de Magma | 1 200 · 1 500 · 1 800 |
| **Skins de maison** | Maison Enchantée · Château de Cristal · Manoir Hanté | 2 500 · 3 000 · 2 000 |
| **⚡ Vitesse** | ×4 · ×6 | 5 000 · 20 000 |
| **⚡ Mode Auto-Wave** | vagues enchaînées sans délai (bouton `Auto` du HUD) | 10 000 |

Les aperçus 3D de la Boutique, de l'Inventaire et des panneaux de tour sont des **rendus offscreen temps réel** du vrai modèle 3D (`UI._pvImg` — scène Three.js hors écran, caméra auto-cadrée sur la bounding box).

---

## 🎨 Skins & structures 3D

- **Skins de tours** : teinte + finitions PBR (metalness/roughness/opacity) **et décorations géométriques distinctives** (`buildSkinDecor` — `src/assets.js`) : bagues dorées, éclats de cristal, braises de magma…
- **Skins de maison** : `buildBaseSkinDecor` construit de **vraies structures** autour de la demeure (coordonnées absolues, 1 unité = 1 m) :
  - **Maison Enchantée** : cercle de 8 menhirs runiques, sigile lumineux au sol, cristal arcanique sur le faîtage, runes en lévitation.
  - **Château de Cristal** : plateforme de glace, muraille de 9 pics de cristal, grand cristal royal sur le toit.
  - **Manoir Hanté** : tombeaux penchés, arbre mort, 4 spectres flottants, brume verte, lanterne courbée.
- **Favicon** : `public/favicon.svg` (tête de zombie au-dessus d'un toit), branché dans `index.html`.

---

## ⚙️ Paramètres & sauvegarde

### Panneau Paramètres (menu principal)
- **Particules** : Faible / Moyen / Max.
- **Cadavres visibles simultanés** : 5 / 10 / 20 / 40 / 80.
- **Son** : On / Off.
- **Sauvegarde progress.json** : 🔗 Lier / ⬇️ Exporter / ⬆️ Importer / Délier + ligne de statut.
- **⟳ Réinitialiser la progression** (tout effacer, après confirmation) — **c'est le SEUL moyen de remettre `progress.json` à zéro**.

### Système de sauvegarde (deux couches)
| Couche | Où | Rôle |
|---|---|---|
| **Brouillon** | `localStorage` — clé `ztd_save_v1` | Rapide, synchrone, toujours dispo. Écrasé à chaque `persistSave`. |
| **Définitif** | Fichier **`progress.json`** (lié via la File System Access API) | Robuste, **jamais effacé** sauf bouton Reset. Miroir silencieux du brouillon. |

**`progress.json` — détail**
- **File System Access API** : le *handle* du fichier est stocké dans **IndexedDB** (`ztd_fs` / `handles`).
  - `linkProgressFile()` : `showSaveFilePicker` (1 clic pour lier, `requestPermission` en `readwrite`).
  - `writeProgressFile()` : **debounce 350 ms**, `queryPermission` avant écriture → **jamais de blocage** en arrière-plan.
  - `loadProgressFromFile()` : **au boot, le fichier est la source de vérité** — il **récupère la progression** si le brouillon localStorage a été effacé.
  - `unlinkProgressFile()` : délie le fichier (le brouillon localStorage reste).
- **Fallback** (navigateurs sans FSA — Safari/Firefox) : boutons **Exporter** (télécharge `progress.json`) / **Importer** (lit un `progress.json`). `fsSupported()` détecte la capacité.
- **Reset** : `resetSave()` vide le localStorage **et** réécrit le fichier avec l'état par défaut.

### Format de sauvegarde (`DEFAULT_SAVE` — `src/save.js`)
```jsonc
{
  "coins": 0,                    // cagnotte permanente
  "ownedTowers": ["gunner","sniper","mine","barricade"],   // possédées
  "equippedTowers": ["gunner","sniper","mine","barricade"],// équipées (max 5)
  "ownedSkins": [],              // skins achetées (tours + maison)
  "towerSkin": "classic",        // skin de tour équipée
  "baseSkin": "classic",         // skin de maison équipée
  "towerCaps": { "gunner": 2, "frost": 2, "flame": 2, "sniper": 2, "mortar": 2,
                 "mine": 2, "shock": 2, "gatling": 2, "farm": 2, "barricade": 2, "necro": 2 },
  "unlockedSpeeds": [1, 2],      // x4 (5 000) et x6 (20 000) s'achètent
  "autoWaveOwned": false,        // ⚡ Mode Auto-Wave (10 000)
  "lastMode": "debutant",        // dernier mode choisi
  "completed": {},               // modes gagnés → débloque les suivants
  "settings": { "particles": "moyen", "corpses": 20, "sound": true }
}
```
La **migration** (`_migrate`) fusionne sur les valeurs par défaut et corrige les sauvegardes anciennes (manque d'`equippedTowers`, de caps, etc.).

---

## 🔊 Audio

100 % **synthétisé en WebAudio** (zéro asset) :
- **Tirs distincts par tour** (balle, traceur, glace, flammes, cloche, choc en chaîne, rafale…).
- **Impacts**, **morts**, **placements**, **achats**, **améliorations**.
- **Alarme de vague**, **coup à la base**, **fanfare de victoire**, **glissando de défaite**.
- `AudioContext` **lazy** (déclenché au premier geste utilisateur), **throttlé** (< 1 son / 55 ms), coupable dans les Paramètres.

---

## ⏱️ Vitesses & horloge de jeu

- **Vitesses** : ×1 et ×2 par défaut ; **×4 = 5 000 🪙** et **×6 = 20 000 🪙** s'achètent en Boutique. Le bouton `Speed` cycle parmi les vitesses **débloquées** (`unlockedSpeeds`).
- **Mode Auto-Wave** (10 000 🪙) : le bouton `⚡ Auto` du HUD enchaîne chaque vague **immédiatement** à la fin de la précédente.
- **⏱️ Horloge de jeu** (point 10 — correction majeure) : le loop scale le `dt` par la vitesse (mouvement des zombies), mais tous les **timers de gameplay** utilisaient autrefois `performance.now()` (temps réel) → les tours n'accéléraient pas avec les zombies. **Fix** : une **horloge de jeu** `gameTime` (ms, scalée : `gameTime += dt·1000`). Toutes les entités reçoivent `(dt, game, gameTime)` comme horloge de gameplay ; le temps **réel** est réservé aux animations cosmétiques (recoil, mort, slam, téléport, shake, UI). Résultat : **×4 = 8 tirs/s** (Gunner) vs 2 tirs/s en ×1 — ratio exact.

---

## 🏗️ Architecture du code

```
index.html          Structure du HUD + overlay plein écran (menu/boutique/inventaire/pa…/
                    Paramètres) + favicon
src/main.js         Bootstrap 3D : renderer (ACES, PCFSoft shadows, pixelRatio ≤ 1,75),
                    caméra orbitale, boucle RAF (delta clampé ≤ 0,1 s), exposition des
                    handles de test (window.__game, __CONFIG, __DIFFICULTIES, __terrainHeight),
                    chargement du progress.json lié au boot
src/scene.js        Scène, lumières, relief sinusoïdal aplati près du chemin, ruban du chemin
                    (Catmull-Rom centripetal, DoubleSide), props thématiques (scatterProps),
                    maison (createBaseModel)
src/path.js         Waypoints (12) + échantillonnage du spline pour collision / placement,
                    nearestProgress(), bloquage par barricade
src/config.js       Source de vérité : 11 tours, 3 zombies + squelette, 10 boss, 6 thèmes
                    (props), 5 modes (DIFFICULTIES, buildModeWaves, buildInfiniteWave),
                    courbes d'HP, prix, caps, skins, DAMAGE_GROWTH
src/entities.js     Tower (ciblage first/strongest/nearest/closer/farther, zap en chaîne,
                    ferme, mine, gel/pétrification, statX() par niveau, levelCap, Barricade,
                    Nécromant), Zombie (skins, barres de PV, mort en deux temps, squelettes),
                    Projectile
src/vfx.js          Particules (mort/éclats/givre/laves/squelettes), screen shake, flash de
                    base, bursts de pièces, earthSpawn, skeletonSummon
src/ui.js           Toute l'interface DOM : menu, écran Difficulté (cartes + miniatures 3D),
                    Boutique, Inventaire (détails, catalogue monstres), Paramètres (+progress.json),
                    panneau de tour, bannières, rendu offscreen des aperçus (_pvImg/_modelFor/_shot)
src/input.js        Souris (fantôme de placement, sélection), clavier (1–6, Espace, U, S, P, Échap)
src/game.js         Game loop : états (MENU/PLAYING/PAUSED/GAMEOVER/WIN), modes & vagues,
                    thèmes, économie (bonus d'avance, bank de pièces, refund 50 %), boss &
                    capacités, achats, spawnSkeleton, damageBarricade
src/save.js         loadSave/persistSave (localStorage), DEFAULT_SAVE + _migrate, catalogue SHOP,
                    couche progress.json (FS Access API + IndexedDB + export/import)
src/sound.js        Synthèse WebAudio (lazy AudioContext, throttle)
src/style.css       Thème sombre + styles de tous les écrans
public/favicon.svg  Icône du navigateur
```

**Détails d'implémentation notables**
- **Matériaux jamais partagés globalement** (mutations par instance : teintes de skins, opacité du Wraith, glow du petrify) ; seul le **cache de géométries** est partagé (`_geoCache`).
- **Formules de niveau** (`Tower.statX()` dans `src/entities.js`) :
  - `statDamage()` = `round(base × DAMAGE_GROWTH^(lvl−1))` (`DAMAGE_GROWTH = 1,36`).
  - `statRange()` / `statSplash()` / rayon = base + somme des `upgrade.*` par niveau.
  - `statCooldown()` = base + somme des `upgrade.cooldown` par niveau.
  - `statChains()` = `base + floor((lvl−1)/2)` (Électro : 2→4).
  - `statSlowPct()` = base + `upgrade.slowPct`/niv, **cap 68 %**.
  - `statNecroPct()` = `0,20 + (lvl−1)×(0,65−0,20)/4` (squelette 20 %→65 %).
  - `levelCap()` = `min(saveData.towerCaps[type], 5)`.
- **Performance** : pas de `PointLight` par projectile (glow émissif), pixelRatio borné, delta clampé, `frustumCulled=false` sur les éléments critiques.
- **Handles de test** : `window.__game`, `window.__CONFIG`, `window.__DIFFICULTIES`, `window.__terrainHeight` exposés pour les scripts Puppeteer.

---

## 🧪 Tests automatisés

**Puppeteer-core headless** (Chrome existant) avec drapeaux **WebGL logiciels** :
```
--no-sandbox --use-gl=angle --use-angle=swiftshader
Chrome : C:/Users/Home/.cache/puppeteer/chrome/win64-152.0.7977.42/chrome-win64/chrome.exe
```
Les scripts `_*.cjs` (menu, placement, boutique, skins, modes, régressions de boutons, features, progress.json…) vérifient l'**absence d'erreurs console** (`pageerror`) et le **comportement des mécaniques** (stats de niveau, caps, barr
icades, squelettes, horloge…). Le **build de production doit rester propre** (`npm run build`).

**Recettes de test types** (via `window.__game`) :
- Stats de niveau : acheter Lv3/Lv4 d'un Gunner → 4 Gunners posées → **les 4** montent au cap.
- Équilibrage vitesse : Gunner (cd 0,5 s) → ×1 = 2 tirs/s, ×4 = 8 tirs/s, ×6 = 11 tirs/s.
- Barricade : 500→0 sous 1 mob de 25 PV/s en ~20 s ; placement validé/refusé selon distance au chemin.
- Nécromant : 1 squelette spawn en reverse, meurt en 1 frappe, 3e refusé (cap), % 20→65 au niveau.
- progress.json : UI + 4 boutons + statut, `fsSupported=true`, export/délier sans erreur, persistance LS intacte.

---

## 📐 Notes de design

- **Tout est procédural** : zéro modèle, son ou texture externe — le projet tient dans le navigateur sans aucun asset.
- L'équilibrage repose sur des **courbes multiplicatives douces** (dégâts ×1,36/niveau, PV de vagues linéaires + quadratique légère) plutôt que des bonus additifs.
- Les **modes finis** ont chacun **leur carte dédiée** ; l'**Infini** fait vivre les 6 thèmes.
- Les **upgrades de tours** restent achetables **par tour type** (plafonds individuels) — on n'achète jamais de niveaux inutiles.
- **Progression en 3 couches** : brouillon localStorage (rapide) + `progress.json` (définitif, robuste) + mode déverrouillé (challenge). Le Reset est le **seul** bouton de remise à zéro.
- **Règle d'or** du genre : un **boss** à la base = défaite instantanée (mini-boss compris) — cela donne du poids aux boss et pousse à les priorité-cibler.

---

## 📜 Journal des ajouts

*(Du plus récent au plus ancien.)*

- **Nouveautés v2 (terminées, test navigateur OK)**
  - **Barricade** : 11e tour posée **sur le chemin**, PV 500→1 900 (Lv), les mobs bloqués la grignotent (dégâts = leurs PV/s), soin lent. `nearPath` ajoutée à `canPlace()`.
  - **Tour Nécromant + Squelettes** : ressuscite les kills en squelettes (barrières) près de la base, marche en sens inverse, se sacrifie (dégâts = PV), 20 %→65 % au niveau, 3 max posées. VFX `skeletonSummon`.
  - **Sauvegarde `progress.json`** : bascule localStorage → fichier (FS Access API + IndexedDB), auto-save débouncé, fichier = source de vérité au boot, fallback Exporter/Importer, Reset remet le fichier à zéro.
- **Points 1–11 (tous corrigés, test navigateur OK)** : plafonds de niveau en boutique, gel visible du Frost King, équilibrage Pyro Lord, caps de tours (par type + par mode), fix Infini (s'arrêtait à la vague 1), zone de portée résiduelle après Rejouer, chaînes Électro par niveau, spawn des minions près de la base (Nécromant), max 5 tours équipées (loadout), horloge de jeu (tours qui n'accéléraient pas).
- **Bouton « ← Retour au menu » unifié** sur les 4 écrans du menu + corrections de boutons morts.
- **Cartes plus denses** : 3 nouveaux props 3D (crâne, arbre mort noué, baril rouillé) + dizaines de props par thème ; **skins de maison devenues de vraies structures 3D** (menhirs, pics de glace, tombeaux) ; **favicon** navigateur.
- **Sons** WebAudio complets (tirs par tour, alarmes, fanfares) + **Paramètres** (particules, cadavres, son, reset) ; **équilibrage v2** (courbes adoucies, tours Lv5 compétitives).
- **6e thème** ☢️ (dôme, barils, plots jaune/noir, flore mutante) + props enrichis ashlands/haunted.
- **Skins de tours avec géométries distinctives** + **aperçus 3D réels** (boutique, inventaire, panneaux) via renderer offscreen.
- **Modes de difficulté TDS** : 4 campagnes (25/30/35/40 vagues) + Infini, cartes dédiées, mini-boss toutes les 5 vagues, boss final par mode, **déverrouillage progressif persistant**, bonus de victoire (500→5 000 🪙).
- **3 nouvelles tours** (Électro, Minigun, Ferme) → 9 au total ; **vitesse ×4/×6** et **Mode Auto-Wave** achetables ; carte agrandie 68×52 avec chemin en S.

---

## 🚀 Release v0.1.1

> **Nouvelle version** : 3 nouveautés de gameplay (2 tours + sauvegarde fichier) et la correction de **11 bugs** signalés. Le tout **testé** (Puppeteer headless, zéro erreur console). La version précédente (v0.1.0) posait les bases : 9 tours, 5 modes de difficulté, 6 thèmes, skins 3D, sons WebAudio, boutique/économie.

### ✨ Nouveautés

1. **🧱 Barricade** — 11ᵉ tour, posée **sur le chemin** (les autres tours l'excluent ; `canPlace()` exige `nearPath` ≤ 1,5 u).
   - PV **500 → 1 900** (Lv1→Lv5), **soin lent** intégré.
   - Un zombie bloqué **grignote** la barricade en infligeant un montant = **ses PV / seconde** (`path.js : blockedBy → barricade` + `damageBarricade`). C'est un **mur éphémère** pour gagner du temps.
   - Modèle 3D : palissade d'épines (11 piquets) + rangée de pointes. Boutique : **2 000 🪙**.
   - *Test : 500→0 sous un mob de 25 PV/s ; placement sur/loin du chemin validé/refusé.*

2. **💀 Tour Nécromant + Squelettes** — la Nécro **vole les kills** dans son empreinte (un kill = dégâts ≥ PV ou fuite) et, à intervalle (**cd 8→4 s** selon le niveau), **ressuscite un squelette près de la base** (`spawnSkeleton`).
   - Le squelette marche **dans le sens inverse** (`progress −= speed·dt`) pour aller au-devant de la horde, **se sacrifie** (ses dégâts = ses PV) et meurt en 1 frappe.
   - **PV du squelette = % des PV du monstre source : 20 % (Lv1) → 65 % (Lv5).**
   - Caps : **3 Nécromants** posés max + **3 squelettes** vivants par Nécromant. VFX `skeletonSummon` (os + particules). Boutique : **8 000 🪙**.
   - *Test : 1 squelette reverse, meurt en 1 frappe, 3ᵉ refusé (cap), % 20→65 au niveau.*

3. **💾 Sauvegarde `progress.json`** — la progression est désormais aussi sauvegardée dans un **fichier `progress.json`**, en plus du brouillon `localStorage`.
   - **File System Access API** : le handle est stocké en **IndexedDB** ; 1 clic pour **lier** le fichier (`showSaveFilePicker`). **Auto-save** débouncé (350 ms), jamais bloquant (`queryPermission` avant écriture).
   - Au **boot**, le fichier lié est la **source de vérité** : il **récupère la progression** si le brouillon localStorage a été effacé.
   - **Fallback** (Safari/Firefox) : boutons **Exporter** / **Importer** `progress.json`. `Délier` disponible.
   - **Jamais effacé** sauf le bouton **Reset** (qui réécrit le fichier à l'état par défaut). UI dans **Paramètres** : 🔗 Lier / ⬇️ Exporter / ⬆️ Importer / Délier + statut.
   - *Test : UI + 4 boutons + statut OK, `fsSupported=true`, export/délier sans erreur, persistance LS intacte.*

### 🐛 Bugs corrigés (11)

| # | Bug | Correction |
|---|---|---|
| 1 | **Plafonds de niveau inutilisables en partie** : on achetait Lv3/4/5 en Boutique mais on ne pouvait plus améliorer les tours en jeu. | `Tower.levelCap()` lisait `saveData.towerCaps[this.key]` alors que Tower n'a pas de `.key` (c'est `.type`), et `this.game` n'était pas stocké → le cap restait à 2. Fix : `this.game = game` + `caps[this.type]`. |
| 2 | **Un achat de niveau ne s'appliquait qu'à une tour** (pas à toutes du même type). | Même racine que le #1 : le cap mal lu bloquait tout. Désormais **toutes** les tours du type montent au cap acheté (vérifié : 4 Gunners → les 4 en Lv4). Les paliers restent séquentiels (Lv3 avant Lv4). |
| 3 | **The Frost King « glace rien »** : le gel fonctionnait mais n'était pas visible (alors que les mini-boss gelaient bien). | Nouveau `Tower.icePetrify(3 s)` **visible** (teinte glace `#63C8FF`, restaurée à la fonte), rayon **6 → 10**. |
| 4 | **Le mode ∞ Infini s'arrêtait à la vague 1** (aucune vague suivante). | La branche Infini de `_checkWaveComplete` était un no-op → `autoWaveReady` jamais armé. Fix : on l'arme comme le mode fini ; la vague n+1 est fabriquée par `buildInfiniteWave`. |
| 5 | **Pyro Lord (Moyen, mini-boss vague 5) trop létal** : 2-shottait la base et tirait trop vite. | Boule de feu **18 → 5 dégâts**, **délai de 5 s** après le spawn avant la 1ʳᵉ boule, puis **1 boule / 5 s**. |
| 6 | **Pas de limite d'équipement** : on pouvait équiper/poser toutes ses tours. | **Max 5 tours équipées** (`equippedTowers`). Une tour **achetée n'est PAS équipée par défaut** → à équiper dans l'Inventaire pour jouer. Badges « ⚔ Équipée / Non équipée » + boutons Équiper/Déséquiper. |
| 7 | **La zone de portée restait affichée après « Rejouer »**. | `_resetState()` appelle désormais `hideTowerRange()` + `hideTowerPanel()` (anneau retiré, sélection nulle). |
| 8 | **Électro : aucune amélioration de chaînes avec le niveau**. | Nouveau `statChains()` : base 2 + 1 chaîne tous les 2 niveaux → **4 chaînes en Lv5** (dégâts décroissants). Cap : 3 Électro posées. |
| 9 | **Aucun nombre max de tours posées**. | Caps **par mode** (Débutant 30 / Moyen 25 / Avancé 20 / Impossible 15 / Infini 30) **+ par type** (Gunner 15, Sniper 5, Ferme 3, Mine 10, Frost 6, Flame 4, Mortar 5, Électro 3, Minigun 4, Barricade 12, Nécromant 3). HUD : compteur « TOURS x / max » + badge **MAX**. |
| 10 | **À ×4/×6, les tours n'accéléraient pas comme les zombies**. | Tous les timers de gameplay utilisaient `performance.now()` (temps réel). Ajout d'une **horloge de jeu `gameTime`** (ms, mise à l'échelle de la vitesse) : tours, projectiles, boss, gel/ralenti suivent le jeu. Test : Gunner ×1 = 2 tirs/s, ×4 = 8 tirs/s (ratio exact). |
| 11 | **Nécromant : les minions spawnnaient loin de la base**. | `spawnMinion(pos)` ignorait `pos` (fixait `progress = 0,9`). Fix : `path.nearestProgress(pos)` → le minion sort **de terre à la position** du boss, avec animation d'émergence + VFX `earthSpawn`. |

### ✅ État
> ✅ **Tout est terminé et testé.** 3 nouveautés + 11 corrections, zéro régression (tests features, persistance et boot refaits après chaque changement).

### 📝 Note dev (rappels pratiques)
- **Serveur dev** : port **5201** (`npx vite --port 5201`) — **jamais** de `taskkill node`.
- **Tests** : Puppeteer-core headless, `--use-gl=angle --use-angle=swiftshader`, Chrome `C:/Users/Home/.cache/puppeteer/chrome/win64-152.0.7977.42/chrome-win64/chrome.exe`.
- `window.__game`, `window.__CONFIG`, `window.__DIFFICULTIES`, `window.__terrainHeight` exposés par `main.js` après init.
- `path.pointAt(p)` renvoie un `Vector3` ; `game.canPlace(type,x,z)` ; `game.placeTower(type,x,z)`.
- Boutique niveaux : `buyTowerLevel(towerKey, level)` — séquentiel (Lv3 avant Lv4).
- Sauvegarde : `localStorage` `ztd_save_v1` **+** `progress.json` (liens/état dans `src/save.js`), `towerCaps` par type de tour.