# CSFD-Compare

## Dev

- Login into github with VSCode
- Then: [https://stackoverflow.com/a/55568568](https://stackoverflow.com/a/55568568)

## Changelog

> **v0.6.0.1** _(2022-12-28)_  

- **FIX**
  - Neukazovalo se tlačítko pro načtení hodnocení

> **v0.6.0** _(2022-12-28)_  

"Menší" vánoční update :-)

- NEW
  - Přidána ikona pro IMDb link (tlačítko) u filmů/seriálů ([#18](../../issues/18))
  - Přidána tlačítka pro `reset nastavení` a `reset přidaných filmů` ([#16](../../issues/16))
  - V CC menu jsou nyní obrázkové nápovědy v sekci `Film/Seriál`, `Uživatelé` a `Herci` ([#4](../../issues/4))
  - V diskuzích je nyní možné reagovat na sebe, nejen na ostatní uživatele ([#2](../../issues/2))
    - ! OMEZENÍ:
      1) nelze pak reagovat na první příspěvek
      2) nelze reagovat na více "svých" příspěvků najednou
  - CC menu je trochu přepracováno, aby šetřilo místo:
    - Snížen padding, je to více na sobě
    - Tlačítko "Načíst hodnocení" bylo zbaveno počtu načtených filmů
    - Počet načtených filmů je nyní zobrazeno v titulku
  - Pokud je načteno více filmů, než je shlédnutých, objeví se nabídka, zda přenačíst vše
  - Přidáno nové načítání filmů, je to "experimentální", dělá to víc stránek naráz
    - To se pojí s novou databázovou strukturou v LocalStorage, **je třeba přenačíst vše znovu**
  - Při ohodnocení nebo odstranění hodnocení se nyní CC menu aktualizuje okamžitě, netřeba refreshovat stránku
  - Dočasná vánoční výzdoba
- FIX
  - Ukládání filmů by mělo být stabilnější
  - Opraveno pár okrajových případů, kdy script celý spadl
  - Opraveno zobrazování nabídky odkazů na obrázky v několika případech
  - Csfd opět někde změnilo styl a v případě, kdy byly skryty sekce hlavní stránky bylo CC menu zbytečně široké
  - Zobrazení "vypočtených" hodnocení - zobrazí se jako černé hvězdičky - by mělo být stabilnější
  - Zobrazování prvků v CC menu pro nepřihlášené uživatele
  - Opraven update dopočítaných hodnocení ([#3](../../issues/3))

> **v0.5.12** _(2022-10-xx)_  

- NEW
  - Pokud je seriál ohodnocen vypočtením průměrů episod, zobrazí se jako černé hvězdičky
  - Přidána kapota nových informací do individuálně uložených dat v Local Storage
- FIX
  - Srovnání hodnocených/uložených hodnocení nyní správně respektuje nová "vypočtené" hodnocení
  - Opraveno zobrazování srovnání hodnocení u jiného uživatele

> **v0.5.12** _(2022-10-01)_  

- FIX
  - Domácí stránka: tlačítko "Skrýt" už nepřeskakuje u boxu videa + přídáno u "Partnerem čsfd..."  ([#12](/../../issues/12)) ([#1](/../../issues/1))  
  - Galerie tvůrců: zobrazení linků na různé velikosti fotky po přejetí myší, tak jak u galerii filmů ([#10](/../../issues/10))  
  - Hodnocení: znovu ukazuje % hodnocení i když hodnotilo méně jak 10 lidí  
  - Hodnocení: znovu ukazuje dodatečné hodnocení jako průměr od oblíbených uživatelů  

> **v0.5.11.1** _(2021-11-24)_  

**Fix:** 1-řádkový seznam filmů se nyní zobrazuje stabilněji (jde vidět hodnocení, (skoro ve všech případech))  

> **v0.5.11** _(2021-11-24)_  

**New:** Boxy na domácí stránce se nyní skrývají tlačítkem "Skrýt" u titulku, zpět zobrazují přes nastavení v CC  
**New:** U herců jsou seznamy filmů na 1 řádek. Pokud by film přeskočil na řádek druhý, jsou zobrazeny "..." (experimentální)  

> **v0.5.10** _(2021-11-10)_  

**Fix:** Pokud máte zaplé rozšíření csfd-movie-preview, nyní se již nebude zobrazovat náhled cachovaného filmu nad CC  
**Fix:** Opraveno zobrazení ovládacího panelu po přejetí myší, pokud je okno prohlížeče menší jak 635px  

> **v0.5.9** _(2021-07-20)_  

**New:** Přidáno zobrazování průměru hodnocení oblíbených uživatelů, pokud nějací hodnotili  
**Fix:** "Datum hodnocení" změněno defaultně jako vypnuté, protože jej zohledňuje CSFD-Extended  

> **v0.5.8** _(2021-07-20)_  

**New:** Přidáno zobrazování "Datum hodnocení", protože to čsfd po 2 dnech odebrala.... the fuck  
**Fix:** Opravena funkce 'Zobrazit spočteno ze sérií', už se opět ukazuje pod 'Moje hodnocení'  

> **v0.5.7** _(2021-07-16)_  

**New:** Přidáno nastavení pro zobrazování vypočtených % hodnocení, pokud to nehodnotilo ještě 10 uživatelů  

> **v0.5.6** _(2021-07-14)_  

**New:** Přidáno nastavení pro zobrazování odkazů na jednotlivé velikosti obrázků v galerii  
**Del:** Odebrána klikatelnost obrázků/plakátů v plné kvalitě, nahrazeno výše zmíněným  
**Del:** Odebráno zobrazování "Datum hodnocení", protože to čsfd konečně přidala  

> **v0.5.5** _(2021-07-13)_  

**New:** Navrácení klikatelných obrázků/plakátů (v plné kvalitě) v galerii filmů či tvůrce  

> **v0.5.4** _(2021-07-12)_  

**New:** Možnost přenačíst všechna hodnocení i po kliknutí na varovnou ikonu v nastavení  
**Fix:** Pokud má uživatel uloženo více hodnocení než existuje, tlačítko obnovení resetuje a obnoví vše  
**Fix:** Duplikace uživatelského hodnocení na stránkách uživatele  
**Fix:** Po najetí kurzorem na verzi už nyní zobrazuje správně changelog  
**Fix:** Pár úprav, které by měly řešit načítání viděných filmů  

> **v0.5.3** _(2021-07-01)_  

**New:** Rychlejší obnovení DB, pokud už je částečně načtena  
**New:** Tlačítko pro obnovení přesunuto nahoru, zelenou fajfku teď zobrazuje i StarNames  

> **v0.5.2** _(2021-06-30)_  

**New:** Přidáno zobrazování hodnocení (hvězd) u viděných filmů/sérií (StarNames obdoba)  

> **v0.5.0** _(2021-06-27)_  

**New:** Zcela přepracovaná logika načítání a porovnávání hodnocení (rychlejší)  
**New:** U porovnávání hodnocení přejetím myší nad mým hodnocením se zobrazí datum  
**New:** Tlačítko pro obnovení hodnocení přesunuto do csfd-compare settings panelu (původně v uživ.)  
**New:** Přidáno tlačítko do nastavení: "Přenačíst hodnocení" - zelená fajfka  
**New:** Přidáno nastavení: Skrýt panel - Vítej na ČSFD  
**New:** Vylepšené zjišťování updatů, nyní jednou za 5 minut, ale info si drží v mezipaměti  
**Fix:** Oprava detekce logovaného uživatele u Greasemonkey  
**Fix:** Oprava skrytí registračního panelu v SK verzi  

> **v0.4.5** _(2021-06-23)_  

**New:** Panel nastavení: Přidána sekce "Domácí stránka"  
**New:** Přidáno nastavení: Zobrazit datum ohodnocení  
**New:** Přidáno nastavení: Zobrazit spočteno ze sérií  
**Fix:** Chyby u načítání hodnocení sérií pro "compare" z vypočtených hodnocení  
**Quality:** Nesrovnalost mezi uloženým/reálným počtem hodnocení pro "compare" nyní ukazuje stále  

> **v0.4.4** _(2021-06-22)_  

**New:** Zobrazení data ohodnocení filmu/seriálu  
**Quality:** Lepší načítání informací o nové verzi. Jen jednou za session  

> **v0.4.3** _(2021-06-21)_  

**Fix:** Odebráno nastavení: Skrýt registrační box (čsfd to teď dělá defaultně)  
**New:** Přidáno nastavení: Skrýt panel - Soutěž  
**New:** Přidáno nastavení: Skrýt panel - ČSFD sál  
**New:** Přidáno nastavení: Skrýt panel - Nové trailery a rozhovory  
**New:** Přidáno nastavení: Skrýt panel - Sledujte online / Žhavé DVD tipy  
**New:** Upozornění na aktualizaci nyní ukazuje poslední changelog  

> **v0.4.2** _(2021-06-15)_  

**New:** Kompatibilita s csfd.sk  

> **v0.4.1** _(2021-06-14)_  

**New:** Nově funguje i pro nepřihlášené uživatele (omezeně)  
**New:** Nastavení: zobrazit porovnání hodnocení MOJE x UŽIVATEL (v tabulce hodnocení)  
**New:** Panel nastavení: přidána verze skriptu  
**Fix:** Zbavení se nepotřebného kódu  

> **v0.4.0** _(2021-06-14)_  

**New:** U profilů uživatelů přidáno tlačítko pro zaslání zprávy (místo klikání v ovládacím panelu)  
**New:** První nástřel "nastavení", kde si uživatel vybere, co zapne/vypne  
**New:** Klikatelné boxy místo tlačítka "VÍCE"  
**New:** Tlačítko pro přidání/odebrání z oblíbených na profilu uživatele  
**New:** Možnost filtrovat uživatele, jejichž recenze nebudou zobrazeny  
**New:** Klikatelný box se zprávou od uživatele místo tlačítka "... více"  

> **v0.3.5** _(2021-06-08)_  

**New:** Už žádné vyskakovací okno když nejsou načteny filmy. Nyní jen vykřičník u uživatelského profilu  
**New:** Tlačítko pro obnovení hodnocení se objeví jen pokud nesouhlasí počet uložených záznamů v prohlížeči (LocalStorage) vs počet v profilu uživatele  
**Fix:** Zjištění názvu série (předtím fungovalo jen pro filmy, ne jednotlivé série seriálu)  
**Fix:** Při nenačteném hodnocení a navštívení profilu filmu/série, skript zkolaboval  
