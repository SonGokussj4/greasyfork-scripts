# Changelog

## 0.8.24 - 2026-03-08

### Added

- Hover preview karty pro odkazy na CSFD filmy, tvurce a uzivatele i pro Steam, Wikipedii, AniDB a MyAnimeList.
- Moznost pripnout hover preview klavesou Ctrl, presouvat pripnutou kartu a klikat na odkazy primo v ni.
- Klavesovou zkratku Ctrl+Alt+C pro otevreni menu a novou sekci nastaveni pro hover preview.
- Novy modal po aktualizaci skriptu s prehledem zmen pro novou verzi a plny changelog v informacnim modalu.

### Changed

- Prepracovano menu nastaveni do scrollovatelneho rozlozeni a sjednocena logika hover preview provideru.
- Rozsireny a zkonfigurovany ikony odkazu pro CSFD, YouTube, Steam, Wikipedii, AniDB a MyAnimeList.
- Changelog se nacita z GitHub repozitare a renderuje markdown vcetne obrazku a odkazu.
- Logika zobrazeni novinek si pamatuje posledni potvrzenou verzi a umi zobrazit zmeny znovu i rucne z informacniho okna.

### Fixed

- Opraven konflikt pri ukladani hodnoceni pro ruzne uzivatele stejneho filmu pouzitim klice MovieID-UserSlug.
- Stabilizovano nacitani a zobrazeni hodnoceni, ikon odkazu a hover preview po velkem refaktoru a rozsireni provideru.

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
