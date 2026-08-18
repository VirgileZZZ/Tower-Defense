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

## 🗺️ Les cinq thèmes (cycles automatiques)

| Theme | Carte / ambiance |
|---|---|
| **suburb** | Route asphaltée, pelouses et maisons de banlieue, ciel clair |
| **winter** | Sol givré bleu-blanc, neige en permanence, sapins blancs |
| **volcanic** | Terres brûlées or/rouge, volcan actif avec particules, astrolabe de lumière |
| **ashlands** | Post-apo : brume grise, herbes mortes rousses, débris et gravats |
| **haunted** | Basse saturation bleue-verte, brume spectrale, lucioles/essences vertes |

La vague 1–5 = suburb, 6–10 = winter, 11–15 = volcanic… et le cycle recommence (modulo sur `(wave−1)/5`), donc les thèmes tournent pendant toute la partie de 100 vagues. Le bouton « changer de map » d'antan a été retiré du HUD — le jeu gère tout seul.

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

## 📌 Notes / décisions de design

- **Pas de modèles externes** : tout est procedural Three.js (primities), donc zéro asset à gérer.
- La difficulté monte en fin de partie : scaling quadratique des PV + boss capables d'attaquer vos tours, d'invoquer des minions et de vous lancer des projectiles.
- Le bouton « Map » du HUD a été retiré : le thème change automatiquement (voir la table plus haut).
- Les upgrades sont équilibrés en **courbe multiplicative douce** plutôt qu'en bonus additifs disproportionnés.
