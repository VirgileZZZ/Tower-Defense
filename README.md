# 🧟 Zombie Tower Defense 3D

Jeu de tour défense (tower defense) **entièrement en 3D** avec **Three.js**, tourné sous un serveur **Vite**. Aucune ressource externe : tous les modèles 3D (tours, zombies, boss, maison, décorations de skins) sont générés à partir de primitives Three.js.

---

## 🚀 Démarrage rapide

```bash
npm install          # installe Vite + three
npm run dev          # serveur de dev — ouvre l'URL affichée (ex. http://localhost:5201/)
npm run build        # bundle de production dans dist/
npm run preview      # sert le build de production
```

`package.json` est en **ESM** (`"type": "module"`). Le projet utilise Vite 8.x (base rolldown) et Three.js récente.

---

## 🎮 Comment jouer

- Placez des tours sur les emplacements verts autour du chemin ; cliquez sur une tour pour l'inspecter, **upgrader** ou la revendre (refund 70 %).
- Les zombies suivent un **chemin sinueux unique** de `src/path.js` jusqu'à votre maison. Chaque fuite lui coûte **10 PV** ; la maison en a 25. À zéro : Game Over (les PV se restaurent à chaque menu, les pièces non).
- Il y a **100 vagues**, avec un **boss tous les 10 vagues**. Les thèmes de carte changent automatiquement toutes les ~5 vagues et tournent en boucle (voir « Thèmes »).
- Vitesse du jeu : le bouton `Speed` de l'HUD alterne entre les vitesses débloquées (**×1, ×2 par défaut** ; **×4 = 5 000 🪙**, **×6 = 20 000 🪙** en Boutique).
- ⚡ Le bouton **Auto** (à côté de Speed) supprime le délai de 5 s entre les vagues. Il n'apparaît dans l'HUD qu'**après son achat en Boutique (10 000 🪙)**. La vague suivante démarre alors immédiatement à la fin de la précédente.
- Les pièces, tours achetées, skins et plafonds de niveaux sont **sauvegardés automatiquement** dans `localStorage` (clé `ztd_save_v1`) d'une session à l'autre.

### Contrôles clavier
| Touche | Action |
|---|---|
| `B 1…6` | choisir le type de tour à construire (selon les tours débloquées) |
| `X` | supprimer / annuler la sélection en cours |
| `P` ou `Échap` | pause / reprise |
| Clic gauche | placer une tour · sélectionner un bouton/UI · désélectionner sur vide |
| Clic droit | fermer le panneau de tour (ou annuler) |

Le **placement fantôme** suit la souris, passe au-dessus du terrain 3D et se fige près du chemin ou des tours ; vert = place valide, rouge = invalide.

---

## 🗼 Les six tours

| Tour | Prix | Style |
|---|---|---|
| **Gunner** (débloqué) | 50g | Tirs simples rapides, le couteau suisse |
| **Sniper** (débloqué) | 120g | Longue portée, gros dégâts, cadence lente |
| **Mine** (débloquée) | 30g | Damier auto : déplace un zombie + dégâts de zone à son passage |
| **Frost** — achetable en Boutique (5 000 🪙) | — | Ralentit les zombies (~40 → 68 % max), petit dégât |
| **Flame** — achetable en Boutique (5 000 🪙) | — | Dégâts continus (beam de feu) en zone courte |
| **Mortar** — achetable en Boutique (3 000 🪙) | — | Salves en arc, gros dégâts d'éclat |

**Niveaux :** chaque tour monte de **Lv1 → Lv5**. Au départ le plafond est **Lv2** ; les paliers 3/4/5 s'achètent dans la section « Niveaux avancés » de la Boutique (1 case par niveau, remplissage or quand possédé). Courbe de dégâts douce : **×1,32 par niveau** (ex. Gunner : 10 → 13 → 17 → 23 → 30), petits bonus linéaires sur portée/éclat/cadence, ralentissement plafonné à 68 %.

---

## 🧟 Vagues, zombies & boss

- `CONFIG.buildWaves()` génère les **100 vagues** au démarrage (aucune table statique) : composition croissante + scaling des PV en **linéaire × quadratique** (`1 + 0,13·(w−1) + 0,0035·(w−1)²`), pour que les vagues tardives pèsent vraiment.
- Types de zombies (skins par thème : classique / `snowy` / `magma` / `ashen` / `phantom`) : **walker** (base), **fast** (rapide, fragile), **tank** (lent, solide), **wraith** (semi-transparent).
- **10 boss uniques**, chacun avec son modèle 3D et sa capacité : Goliath (*Petrify*), Sprinter Royal, Matron Mireille (*Cercle de Vie*), Colossus Ashen (*Onde de choc* → ralentit vos tours), Phantasm Warden (*Phasing*), Frost Empress (*Aura gelée* → fige une tour + givre sur les zombies), Pyroclast Titan (*Fireball*), Hive Tyrant (ravitaille les zombie morts-vivants + invoque un minion), Void Reaver (*Stun*), Gravemother.
- **Boss every 10 waves** : le boss apparaît en dernier de la vague et ouvre son « ability window » ~2 s plus tard ; il peut invoquer des minions, lancer des fireballs vers votre base ou vous, etc.

---

## 🗺️ Les six thèmes (cycles automatiques)

| Theme | Carte / ambiance |
|---|---|
| **suburb** | Route asphaltée, pelouses et maisons de banlieue, ciel clair |
| **winter** | Sol givré bleu-blanc, neige en permanence, sapins blancs |
| **volcanic** | Terres brûlées or/rouge, volcan actif avec particules, astrolabe de lumière |
| **ashlands** | Post-apo : brume grise, herbes mortes rousses, débris et gravats (rochers massifs) |
| **haunted** | Basse saturation bleue-verte, brume spectrale, champignons bioluminescents + roseaux |
| **radioactive** | 🆕 Ciel malade vert-noir, dôme de confinement fêlé avec halo pulsant, barils de déchets rayonnants, plots jaune/noir, flore mutante bioluminescente, rochers sombres — zombies verts irisés (« radiant ») +8 % PV, 5 % armure |

La vague 1–5 = suburb, 6–10 = winter… le cycle recommence (modulo sur `(wave−1)/5` avec 6 thèmes), donc les thèmes tournent pendant toute la partie de 100 vagues.

**⚖️ Équilibrage (v2)** : courbe d'PV zombie adoucie (+11 %/vague au lieu de +13 %, terme quadratique ÷2) et croissance des tours relevée à ×1,36/niveau — les tours niveau 5 restent compétitives jusqu'en fin de partie sans être écrasées par les vagues tardives.

**⚙️ Paramètres (menu principal)** : boutons « ⚙ Paramètres » → panneau avec **Particules** (Faible/Moyen/Max — densité des explosions), **Cadavres visibles simultanés** (5/10/20/40/80), **Son on/off**, et le reset de progression. Le gros bouton « Réinitialiser la progression » d'antan a été remplacé par ce panneau.

**🔊 Audio** : tous les sons sont synthétisés en WebAudio (aucun asset) — tirs distincts par tour, impacts, morts, placements, achats, alarme de vague, coup à la base, fanfare de victoire et glissando de défaite. Throttillés pour rester légers.

**📈 Zones enrichies** : de nouveaux props 3D (réacteur, barils radioactifs, marquage jaune/noir, flore mutante, rochers massifs, roseaux) + 6e zone radioactive complète.

---

## 💰 Économie & persistance

- **Pièces** : tuée = récompense (le boss rapporte gros), **bonus d'avance** si vous lancez la vague suivante avant la fin des 5 s, **refund à la revente** = 70 % de la valeur courante.
- **Les pièces persistent entre les sessions** (localStorage `ztd_save_v1`) : tours achetées, niveaux achetés (`towerCaps`), skins achetés/équipés, vitesses débloquées (`unlockedSpeeds`).
- Menu principal : « Jouer », « Boutique » (avec aperçus 3D en temps réel de chaque tour/skin via un renderer offscreen), « Inventaire » (tours possédées + maison + catalogue des monstres), « Réinitialiser la sauvegarde ».

### Boutique — ce qui s'y achète
| Catégorie | Items | Prix 🪙 |
|---|---|---|
| Tours | Frost, Flame, Mortar | 5000 / 5000 / 3000 |
| Niveaux avancés (tours possédées) | Lv3 / Lv4 / Lv5 par tour | 1200 / 3000 / 7000 |
| Skins tours | Or Sacré, Acier Fantôme, Cœur de Magma | 1200 / 1500 / 1800 |
| Skins maison | Maison Enchantée, Château de Cristal, Manoir Hanté | 2500 / 3000 / 2000 |
| ⚡ Mode Auto-Wave | bouton Auto du HUD (départ immédiat des vagues) | **10 000** |
| ⚡ Vitesse | ×4 — ×6 | **5 000** / **20 000** |

---

## 🎨 Skins & aperçus 3D

- Les skins appliquent une **teinte + finitions PBR** (metalness/roughness/transparence selon le skin) **et des géométries distinctives ajoutées** (`buildSkinDecor` dans `src/assets.js`) : bagues dorées, éclats de cristal, braises de magma, runes flottantes, brouillard spectral… pas juste un changement de couleur.
- **Aperçus 3D réels partout** (boutique, inventaire, panneau de tour) rendus via `Ui._pvImg(key, px)` : scène offscreen Three.js avec lumière hémisphérique + directionnelle, caméra auto-cadrée sur la bounding box (distance ×2.4 pour ne jamais couper les décorations), rendu en data-URL PNG. Préfixes de clés : `t:` tour, `sk:` tour+skin, `h:`/`hb:` maison, `z:` zombie, `b:` boss.

---

## 🏗️ Architecture du code

```
index.html          Structure HUD (barre du haut : pièces/vague/PV base + Speed/Auto/Pause),
                    panneau de construction en bas, overlay plein écran pour Menu/Boutique/Inventaire/Pause…
src/main.js         Bootstrap 3D : renderer (antialiasing, shadowMap PCFSoft, tone mapping ACES,
                    pixelRatio capped à 1.75), caméra orbitale, boucle RAF avec delta clampé ≤0.1s
src/scene.js        Scene, lumières (hémisphérique + directionnelle ombrée + points par thème),
                    terrain (relief sinusoïdal aplati près du chemin), route (ruban Catmull-Rom
                    centrifuge/corrélatif largeur 2.6, dégradé de teintes par sommet DoubleSide),
                    props thématiques (12 types : sapins/rochers/pavillons/antennes… + volcan actif)
src/path.js         Waypoints + CatmullRomCurve3 « centripetal » — échantillonnage pour la collision
src/config.js       CONFIG central : tours, zombies, vagues générées (buildWaves), thèmes, prix shop,
                    damageGrowth 1.32/niveau, plafonds de niveaux… + SHOP_TOWER_DESC / ZOMBIE_TEXTS fr
src/entities.js     Classes Tower (ciblage first/strongest/nearest/closer/farther, modes mine/flame,
                    pétification), Zombie (HP bar au-dessus de la tête, animation de marche avec bras,
                    mort en deux temps), Projectile (trajectoires droites/en arc, flammes)
src/vfx.js          Particules (mort/éclats/ice/snow/magma), flash de base, screen shake,
                    rayons de tour… — tout est pur, pas d'allocs par frame dans la boucle chaude
src/ui.js           Toute l'interface DOM : menu, boutique (aperçus + cases de niveaux), inventaire,
                    panneau de tour, bannières, HUD. Fonctions de rendu _pvImg/_modelFor/applySkin…
src/input.js        Clics souris → placement fantôme / sélection, clavier B/X/P/Échap
src/game.js         Game loop : état (MENU/PLAYING/PAUSED/GAMEOVER/WIN), spawn par vague, thèmes,
                    économie, achats (tours/niveaux/skins/vitesse), capacités des boss, récompenses
src/save.js         loadSave/persistSave (localStorage `ztd_save_v1`), DEFAULT_SAVE complet, SHOP
                    catalogue (prix tours/niveaux/skins + vitesses x4/x6) — les données saturent sur l'ancien state à chaque charge (merge défensif)
src/style.css       Thème sombre du jeu + style de tous les overlays (boutique compacte par lignes,
                    inventaire pleine largeur avec bascule catalogue monstres, panneaux de détails…)
```

**Détails d'implémentation notables :**
- Les **matériaux ne sont jamais partagés globalement** entre entités (mutations par instance : emissive du petrify, retinte des skins zombies, opacité des wraiths) — seul le cache de géométries est partagé (`_geoCache` dans `assets.js`, ≈ 18 % d'allocations en moins).
- Performance : pas de PointLight par projectile (place leur une glow émissive), pixelRatio borné, delta clampé à 0.1 s, `frustumCulled=false` sur les éléments critiques pour éviter les flickers de culling.
- L'exposition globale de debug/test : `window.__game`, `window.__CONFIG`, `window.__terrainHeight` (utilisée par des scripts Puppeteer de test automatisé).

---

## 🧪 Tests automatisés

Puppeteer-core en headless avec Chrome existant (`~/.cache/puppeteer/chrome/...`) et drapeaux WebGL :
```
--use-gl=angle --use-angle=swiftshader
```
Les scripts `_cp*.cjs` (menu, placement, upgrades, boutique, skins, HUD…) vérifient l'absence d'erreurs console et le comportement des mécaniques dans le navigateur. Le build de production doit rester propre (`npm run build`).

---

## 🔁 Derniers ajouts (journal)

**↩️ Bouton « ← Retour au menu » unifié**

- Sur les 4 écrans du menu (Difficulté, Boutique, Inventaire, Paramètres), le bouton retour n'avait ni la même position ni la même taille : en haut et tout-en-largeur dans l'Inventaire (victime de la règle `#screen.wide .inv-wrap > * { width:100% }`), en bas et centré dans Paramètres et Difficulté, petit en haut à gauche dans la Boutique. Désormais tous identiques : **pilule compacte (146 px) en haut à gauche du contenu**, avec un léger survol, sur les 4 écrans (`src/ui.js` + `src/style.css`).

**🐛 Corrections de bugs (boutons morts)**

- **Inventaire → détail tour → « Lv 2 » → bouton 🎨 Skins mort** : le changement de niveau re-génère tout le panneau (`innerHTML`), or les listeners du bouton Skins (et des chips de skins) n’étaient liés qu’au premier rendu → orphelins après un clic niveau. Désormais re-liés à **chaque** rendu (`renderTowerDetail` dans `src/ui.js`), et le panneau de skins reste ouvert/fermé d’un niveau à l’autre. La branche tour ne se lie plus qu’une seule fois (pas de double-événement).
- **Bouton « Resume » fantôme après « ✕ Quitter »** : l’écran de pause posait son bouton « Resume » dans `#screen-btns`, mais `showMenu`/`showShop`/`showInventory`… ne viraient jamais ce conteneur → un vieux bouton « Resume » restait affiché sous le menu, et le cliquer ne faisait rien (l’état est `MENU`, pas `PAUSED`). `_setScreenMode` vide désormais les boutons `screen-action` de `#screen-btns` à chaque écran de menu (`src/ui.js`).

**🌅 Cartes plus denses + skins de maison à part entière + icône navigateur**

- **Les 6 cartes sont plus riches** : chaque thème reçoit des dizaines de props supplémentaires (plus de rochers, buissons, herbe, fleurs, décombres) et 3 **nouveaux décors 3D** (`skull` crâne de zombie, `deadtree` arbre mort noué, `barrel` baril rouillé à bandes de fer) dans `src/assets.js`, déclarés dans les listes `props:` de `src/config.js`. Les rayons de collision / anti-collision du scatter sont dans `scatterProps` (`src/game.js`).
- **Les 3 skins de maison ne sont plus que du changement de couleur** : `buildBaseSkinDecor` (dans `src/assets.js`) construit de **vraies structures 3D** posées autour de la demeure (coordonnées absolues, 1 unité = 1 m) :
  - *Maison Enchantée* : cercle de 8 menhirs runiques, sigile lumineux gravé au sol, cristal arcanique sur le faïtage, runes en lévitation, 2 piliers de porte runiques.
  - *Château de Cristal* : plateforme de glace sous la maison, muraille de 9 pics de cristal, gros cristal royal sur le toit, cristaux épars.
  - *Manoir Hanté* : cercle de tombeaux penchés, arbre mort noué, 4 spectres flottants, brume verte basse, grande lanterne courbée.
  - Le dispatch se fait dans `buildSkinDecor(id, scale, big)` (le flag `big` = modèle de maison >2 m de haut).
- **Icône navigateur** : `public/favicon.svg` (tête de zombie sur le toit de la base), branchée dans `<head>` d’`index.html` via `<link rel="icon">` + `apple-touch-icon`. Copiée automatiquement dans `dist/` au build.

**🚨 Règle d'or du boss à la base** : un boss qui parvient jusqu'à votre maison **vous élimine instantanément**, quel que soit le PV restant (même 20/20). Avant, il ne retirait que 8–16 PV selon sa taille — désormais son passage en force est définitif.

**⚖️ Dégâts infligés à la base par ennemi** (base = 20 PV de départ) :

| Ennemi | Dégâts/leak |
|---|---|
| Walker / Fast (zombies ordinaires, toute zone) | **2** |
| Tank / zombie sale (ashlands), boss vagues 10–30 (Brute, Stalker, Frost King, Pyro Lord, Abomination, Runner, Regenerator) | **5 → 8–12** selon le boss (Pyro Lord : 10, Abomination/Runner/Regenerator : 12) |
| Boss lourds — Stone Golem, Wraith | **14** |
| The Titan (vague 90, 3200 PV) | **16** |
| **Boss à la base (tous)** | **mort instantanée de la partie** 🚨 |

Soit : ~5–8 zombies ordinaires qui se faufilent = défaite ; un seul boss = toujours game over.

**🔊 Sons ajoutés (synthèse WebAudio, zéro asset)** :
- Tirs distincts par tour : Gunner *tic-ping*, Sniper *boum* grave, Frost *fzzz glacé*, Mortier *choc sourd*, Flame *rugissement de feu*
- Impacts des projectiles + mort zombie (pop descendante ; boss = double couche grave)
- Placement de tour (clac + ping), vente, achat boutique (montée tri-tones), upgrade (escalade)
- Alarme two-tone au lancement d'une vague, gong grave + choc quand la base encaisse
- Fanfare de victoire (4 notes montantes) et glissando de défaite (320 Hz → 60 Hz)
- Le tout throttle (<1 tir son/55 ms) pour rester discret et léger — coupable dans ⚙ Paramètres → Son Off.

**⚖️ Équilibrage (v2)** : courbe d'PV zombie adoucie (+11 %/vague au lieu de +13 %, terme quadratique ÷2 : vague 50 ≈ 11,2 au lieu de ~15,8) et croissance des tours relevée à **×1,36/niveau** — les tours niveau 5 restent compétitives en fin de partie.

**⚙️ Paramètres (menu)** : Particules Faible/Moyen/Max · Cadavres visibles 5–80 · Son on/off · Reset progression. Le gros bouton « Réinitialiser » est devenu un petit **⚙ Paramètres** avec ce panneau.

**🗺️ 6e zone radioactive** (dôme, barils, plots jaune/noir, flore mutante) + props enrichis sur ashlands/haunted — cycles automatiques tous les 5 vagues.

---

## 📌 Notes / décisions de design

- **Pas de modèles externes** : tout est procedural Three.js (primities), donc zéro asset à gérer.
- La difficulté monte en fin de partie : scaling quadratique des PV + boss capables d'attaquer vos tours, d'invoquer des minions et de vous lancer des projectiles.
- Le bouton « Map » du HUD a été retiré : le thème change automatiquement (voir la table plus haut).
- Les upgrades sont équilibrés en **courbe multiplicative douce** plutôt qu'en bonus additifs disproportionnés.

---

## Modes de difficulté (style TDS) — nouvelle session

La liste unique de 100 vagues est remplacée par **4 modes + Infini**, chacun sur SA
propre carte, avec mini-boss toutes les 5 vagues et un boss final distinct :

| Mode | Vagues | Carte | PV base | Pièces départ | Boss final | Débloqué si… |
|---|---|---|---|---|---|---|
| **Débutant** | 25 | Cendres / dirt 🪨 | 40 | 350 💰 | `brute` (stun) | par défaut |
| **Moyen** | 30 | Neige ❄️ | 40 | 280 💰 | `abomination` (régénération) | gagné Débutant |
| **Avancé** | 35 | Volcan 🌋 | 40 | 220 💰 | `wraith` (freeze + téléport) | gagné Moyen |
| **Impossible** | 40 | Zone radioactive ☢️ | 35 | 180 💰 | `titan` (pétrification, golem, boss) | gagné Avancé |
| **∞ Infini** | — | toutes les cartes en rotation | 40 | 200 💰 | boss cyclés, vagues générées à la volée | toujours |

- **Mini-boss** (vague 5, 10, 15…) : dégâts = **½ des PV de base du mode** — ils
  blessent fort sans tuer d'un coup ; les mini-boss se renforcent avec l'index de vague.
- **Boss final** : dégâts = PV base complets (1 touché = game over sur ce point).
- Verrouillage progressif persistant (`saveData.completed`), boutons désactivés + tooltip.

### Carte agrandie & path zigzag
Terrain maintenant **68 × 52** (contre 40×30) : plus de place constructive, bordures
naturelles visibles au-delà des cases (bushes/rocks/réacteurs…), path en S à **12 points
d'inflexion**. Borne buildable = `CONFIG.mapBounds`.

### 3 nouvelles tours (inspirées TDS) → **9 au total**

| Tour | Prix | Cooldown | Portée | Comportement | Niveau max |
|---|---|---|---|---|---|
| ⚡ **Shock** (`shock`) | 1500 | 0.8 s | 3.4 | Arc électrique instantané, enchaîne jusqu'à 2 cibles à -35 % | 6 |
| 🔫 **Gatling** (`gatling`) | 1200 | 0.25 s (volley de 3) | 4.6 | Salves rapides de balles, DPS élevé contre les nuées de walkers | 7 |
| 🌾 **Farm** (`farm`) | 900 | toutes les 5 s | — | Génère des pièces périodiques (+ bonus par niveau) ; pas d'attaque | 6 |

Toutes intègrent la courbe standard (dégâts ×1.36/niveau ou revenus croissants),
les skins du catalogue, la boutique de niveaux et le panel d'infos du HUD.

### Divers
- Écran « Jouer » affiche le nom du mode sélectionné ; HUD `Vague x / N` selon le mode
  (`∞` en Infini) ; barre PV de base normalisée au max du mode.
- Gagner un mode l'enregistre dans la sauvegarde et débloque le suivant (persistance).

### Écrans dédiés & récompenses de difficulté (refonte du menu)
Le menu principal ne contient plus que 5 boutons propres :
**Jouer** (dernier mode sélectionné), **Difficulté**, **Boutique**, **Inventaire**, **Paramètres**.

- **Difficulté** → écran dédié : 5 cartes illustrées (SVG dessinés, aucun fichier
  externe : ciel + sol + chemin + maison + zombie + emblème propre à chaque carte),
  nom, nombre de vagues, récompense, état verrouillé/débloqué et bouton *Jouer*.
- **Paramètres** → écran dédié (particules, cadavres, son, réinitialisation) avec
  bouton retour ; plus de panneau qui s'empilait dans le menu.
- **Récompense de victoire croissante** : Débutant +500 🪙 · Moyen +1 000 🪙 ·
  Avancé +2 500 🪙 · Impossible +5 000 🪙 (Infini : survie, sans bonus).
  Le bonus s'ajoute aux pièces de la partie à l'écran *Victory* et persiste.
