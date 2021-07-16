# CSFD-Compare

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
