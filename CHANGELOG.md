# Changelog

## 0.9.1 - unreleased

### Added

- Notifikace o nové verzi skriptu nad CC menu
- Nový náhled: Odkaz na přímou recenzi na CSFD, včetně hodnocení, data a odkazu na recenzi
  ![Recenze](images/changelog/0.9.1-nahledy-recenze.png)

### Changed

- Lepší notifikace o nové verzi skriptu v CC menu
  ![Notifikace](images/changelog/0.9.1-notifikace.png)
  
### Development

- Úprava logiky pro zobrazení changelogu po aktualizaci skriptu v dev prostředí
- Zobrazení fotek z images/changelog v dev módu, přes github v release verzi

## 0.9.0 - 2026-03-09

### Added

- Nova samostatna volba `Nahledy externich odkazu` pro zapinani externich hover preview provideru jako AniDB a MyAnimeList.
- Doplneny nove ulozene stranky pro aktualni CSFD strukturu tvurcu a serialu pro presnejsi vyvoj a testovani.

### Changed

- Prejmenovany polozky hover preview v menu na jasnejsi varianty pro `csfd` tvurce, uzivatele a filmy / serialy / epizody.
- Tooltipy informacnich ikon v CC-menu se vykresluji mimo scrollovatelne telo menu, takze zustavaji citelne i u hlavicky a paticky.
- Changelog z GitHubu se po zmene verze nebo po kratke dobe nacita znovu, aby se nove release poznamky propsaly rychleji.

### Fixedd

- Opraveno klikani na info ikony se screenshoty v pripnutem CC-menu otevrenem pres `Ctrl+Alt+C`.
- Opraveno skryvani tooltipu informacnich ikon za pevnou hlavickou a patickou CC-menu.
- Zpresneno rozpoznani inline hodnoceni u vice CSFD kontextu, hlavne u serialovych a odvozenych stranek.

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
