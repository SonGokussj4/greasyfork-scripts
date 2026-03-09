# Changelog

## 0.8.24 - 2026-03-08

### Added

- Novy modal po aktualizaci skriptu s prehledem zmen pro novou verzi.
- Plny changelog v informacnim modalu v pravem hornim rohu nastaveni.
- Render markdownu vcetne obrazku a odkazu pro obsah changelogu.

![Hint ratings](https://raw.githubusercontent.com/SonGokussj4/greasyfork-scripts/refs/heads/feature/class-rework/images/hint_ratings.png)

### Changed

- Changelog se nacita prednostne z GitHub repozitare a pri nedostupnosti pouziva vestavenou zalohu.
- Logika zobrazeni novinek si pamatuje posledni potvrzenou verzi a umi zobrazit zmeny znovu i rucne z informacniho okna.

## 0.8.23 - 2026-03-07

### Added

- Detailni nahled hodnot v modalnim okne Sprava LocalStorage, vcetne rozbaleni strukturovanych dat.
- Seskupeni cache polozek v LocalStorage a moznost hromadne smazat celou skupinu `cc_creator` cache.

### Changed

- Prepracovan modal Sprava LocalStorage pro lepsi citelnost, vetsi pracovni plochu a prehlednejsi tabulku hodnot.
- Sjednocena znovupouzitelna detailni modal logika pro zobrazovani vnorenych dat v nastaveni.

### Fixed

- Po mazani jednotlivych nebo vsech LocalStorage polozek se znovu synchronizuji prepinace a navazany stav nastaveni.
- Opraveno propisovani navazanych UI aktualizaci po zmenach v LocalStorage, napr. u galerie obrazkovych odkazu a dalsich prvku nastaveni.

## 0.8.22 - 2026-03-05

### Changed

- Prvni vetsi refaktor hover preview provideru a logiky menu.

### Added

- Pridana nova testovaci pokryti pro inline hodnoceni, ikonky odkazu a hover preview controller.
