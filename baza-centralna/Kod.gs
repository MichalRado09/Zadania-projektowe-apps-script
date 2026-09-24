/*************************************************************
 * BAZA CENTRALNA – synchronizacja zadań projektowych
 * Listy zadań projektów (arkusze „#KOD …”) ↔ baza centralna ↔ Kalendarz Google.
 * Wymaga usługi zaawansowanej Google Calendar API (identyfikator: Calendar).
 * Konfiguracja i wdrożenie: README.md w katalogu głównym repozytorium.
 *************************************************************/

// ============================================================
// KONFIGURACJA
// ============================================================
var ID_KALENDARZA_FIRMOWEGO = "TU_WKLEJ_ID_KALENDARZA@group.calendar.google.com";

// Tylko „Anulowane” usuwa wydarzenie z kalendarza. „Ukończone” zostaje.
var USUN_ANULOWANE_Z_KALENDARZA = true;

// WYŁĄCZONE celowo: odpowiedź na zaproszenie nie zmienia
// już statusu zadania (zbyt łatwo o pomyłkowe „Tak”). Status edytuje się
// wyłącznie w pliku projektowym. Mapa zostaje w kodzie na wypadek, gdyby
// kiedyś wrócono do automatycznego statusu z kalendarza.
var AUTO_STATUS_Z_KALENDARZA = false;
var MAPA_ODPOWIEDZI = {
  accepted:    "Ukończone",
  tentative:   "W trakcie",
  declined:    "",
  needsAction: ""
};

// Sprzątanie zadań skasowanych z plików projektowych. NIEODWRACALNE.
var SPRZATAJ_OSIEROCONE      = true;
var MAKS_USUNIEC_NA_PRZEBIEG = 25;

var IMPORT_Z_KALENDARZA = true;
var OKNO_IMPORTU_WSTECZ = 120;
var OKNO_IMPORTU_WPRZOD = 365;

// WYŁĄCZONE celowo: przypisanie osoby przez arkusz nie ma
// wysyłać osobnego powiadomienia e-mail. Wydarzenie i tak pojawia się w jej
// kalendarzu, bo jest uczestnikiem – to nie zależy od tej flagi.
var POWIADAMIAJ_UCZESTNIKOW = false;
var NAPRAW_DATY_W_ARKUSZU   = true;
var UKRYJ_KOLUMNY_SYSTEMOWE = true;

var ID_FOLDERU_PROJEKTOW = "TU_WKLEJ_ID_FOLDERU_PROJEKTOW";

// Plik z listą zadań musi zaczynać się tym znakiem – inaczej skrypt go nie tknie.
var ZNACZNIK_PLIKU_ZADAN = "#";

var ARKUSZ_RAPORT_SYNC   = "RAPORT_SYNC";
var ARKUSZ_RAPORT_KAL    = "RAPORT_KALENDARZ";
var ARKUSZ_RAPORT_IMPORT = "RAPORT_IMPORTU";
var ARKUSZ_POCZEKALNIA   = "NIEPRZYPISANE";

// Nagłówki rozpoznawcze (małymi literami)
var NAGLOWEK_ARKUSZA_ZADAN = "temat";
var NAGLOWEK_BAZY_GLOWNEJ  = "id systemowe";

var KOL = {
  temat: 1, opis: 2, email: 3, dataOd: 4, dataDo: 5, status: 6, uwagi: 7,
  idSystemowe: 8, idKalendarza: 9, ostatniStatus: 10, ostatniaOdpowiedz: 11, migawka: 12,
  // v16, NA KOŃCU (13) – nie przesuwa istniejących kolumn 1–12 w starych plikach.
  ostatniaNotatkaKalendarza: 13
};
// "Ostatnia" kolumna systemowa do zapewniania miejsca / chowania – teraz to 13, nie migawka (12).
var KOL_OSTATNIA_SYSTEMOWA = KOL.ostatniaNotatkaKalendarza;

var POCZ = {
  idWydarzenia: 1, temat: 2, opis: 3, email: 4, dataOd: 5,
  dataDo: 6, projekt: 7, link: 8, dodano: 9, uwagi: 10
};

var KOLORY = {
  wTrakcie: "10", planowane: "7", oczekujace: "6",
  wstrzymane: "11", zamkniete: "8", domyslny: "9"
};

// ============================================================
// MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ Synchronizacja')
    .addItem('📥 Synchronizuj (w obie strony)', 'pelnaSynchronizacja')
    .addSeparator()
    .addItem('🔎 Diagnostyka (nic nie zapisuje)', 'diagnostyka')
    .addItem('📅 Sprawdź stan kalendarza', 'sprawdzKalendarz')
    .addItem('📨 Dlaczego wydarzenie się nie zaimportowało', 'diagnostykaImportu')
    .addSeparator()
    .addItem('🌍 Ustaw strefę Warszawa we wszystkich plikach', 'ustawStrefeWszedzieNaWarszawe')
    .addToUi();
}

// Czynność JEDNORAZOWA – ujednolica strefę czasową bazy głównej i wszystkich
// plików projektowych na Europe/Warsaw. Nie rusza strefy samego projektu
// Apps Script – tego z poziomu kodu ustawić się nie da, patrz raport na końcu.
function ustawStrefeWszedzieNaWarszawe() {
  var STREFA = "Europe/Warsaw";
  var raport = [];

  var glowny = SpreadsheetApp.getActiveSpreadsheet();
  var przed = glowny.getSpreadsheetTimeZone();
  glowny.setSpreadsheetTimeZone(STREFA);
  raport.push("Baza główna („" + glowny.getName() + "”): " + przed + " → " + STREFA);

  // Ten sam zakres co synchronizacja: folder + znacznik w nazwie + zgodny układ.
  var indeksStref = indeksProjektow({ raport: [] });
  var zmienione = 0, bledy = 0;
  for (var i = 0; i < indeksStref.pliki.length; i++) {
    var f = indeksStref.pliki[i].file;
    try {
      var ss = SpreadsheetApp.open(f);
      var przedP = ss.getSpreadsheetTimeZone();
      ss.setSpreadsheetTimeZone(STREFA);
      raport.push(f.getName() + ": " + przedP + " → " + STREFA);
      zmienione++;
    } catch (e) {
      raport.push(f.getName() + ": BŁĄD – " + e.message);
      bledy++;
    }
  }

  raport.push("");
  raport.push("Zmieniono: baza główna + " + zmienione + " plik(ów) projektowych" +
              (bledy ? " (błędów: " + bledy + ")" : "") + ".");
  raport.push("");
  raport.push("ZOSTAJE JEDEN RĘCZNY KROK: strefa samego projektu Apps Script.");
  raport.push("W edytorze skryptu: ⚙️ Ustawienia projektu (koło zębate po lewej) → Strefa czasowa → Europe/Warsaw (GMT+01:00) Warszawa.");
  raport.push("");
  raport.push("Po zmianie obu stref uruchom jeszcze raz zwykłą synchronizację – wpisane wcześniej daty");
  raport.push("mogły się wizualnie przesunąć o dobę przy zmianie strefy; synchronizacja sama je naprawi.");

  Logger.log(raport.join("\n"));
  try { SpreadsheetApp.getUi().alert(raport.join("\n")); } catch (e) {}
}

// ============================================================
// WEJŚCIA
// ============================================================
function pelnaSynchronizacja() { uruchom(false); }

// Synchronizacja chodzi też sama, z wyzwalacza czasowego – wtedy nikt nie
// ma otwartego arkusza i nie ma gdzie pokazać dymka. Dymek to tylko
// informacja, więc gdy się nie da, po prostu go pomijamy, zamiast
// przerywać przebieg błędem (i zasypywać skrzynkę mailami o awariach).
function pokazToast_(ss, tresc, tytul, sekundy) {
  try { ss.toast(tresc, tytul, sekundy); } catch (e) { Logger.log(tytul + ": " + tresc); }
}
function diagnostyka()         { uruchom(true); }

function uruchom(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var problem = sprawdzUslugeKalendarza();
  if (problem) { pokazBlad(problem); return; }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { pokazToast_(ss, "Inna synchronizacja jest w toku.", "Zajęte", 6); return; }

  try {
    var w = przetworzWszystko(dryRun);
    try { zapiszRaportDo(ARKUSZ_RAPORT_SYNC, w.raport); }
    catch (e) { pokazBlad("Praca wykonana, ale raportu nie udało się zapisać: " + e.message); }

    pokazToast_(ss,
      (dryRun ? "PRÓBNIE • " : "") +
      "wierszy: " + w.przetworzone +
      " | nowe: " + w.utworzone +
      " | odtworzone: " + w.odtworzone +
      " | zaktualizowane: " + w.zaktualizowane +
      " | bez zmian: " + w.bezZmian +
      " | z kalendarza: " + w.zPliku_zKalendarza +
      " | konflikty: " + w.konflikty +
      " | zaimportowane: " + w.zaimportowane +
      " | do poczekalni: " + w.doPoczekalni +
      " | usunięte osierocone: " + w.usunieteZadania +
      " | błędy: " + w.bledy,
      dryRun ? "Diagnostyka zakończona" : "Synchronizacja zakończona", 30);

    if (w.przerwane) {
      pokazBlad("PRZEBIEG PRZERWANY.\n\n" + w.przerwane + "\n\nSzczegóły w zakładce „" + ARKUSZ_RAPORT_SYNC + "”.");
    } else if (w.doPoczekalni > 0) {
      pokazBlad("Znaleziono " + w.doPoczekalni + " wydarzeń bez przypisanego projektu.\n\n" +
                "Wskaż projekt w zakładce „" + ARKUSZ_POCZEKALNIA + "”, kolumna " + literaKolumny(POCZ.projekt) + ".");
    } else if (w.bledy > 0 || w.pominiete > 0) {
      pokazBlad("Część zadań wymaga uwagi. Szczegóły w zakładce „" + ARKUSZ_RAPORT_SYNC + "”.");
    }
  } finally {
    lock.releaseLock();
  }
}

function sprawdzUslugeKalendarza() {
  if (typeof Calendar === 'undefined' || !Calendar.Events) {
    return "NIE WŁĄCZONO USŁUGI ZAAWANSOWANEJ.\n\n" +
           "Edytor Apps Script → Usługi → + → „Google Calendar API” → Dodaj.\n" +
           "Identyfikator musi zostać jako: Calendar";
  }
  try { Calendar.Calendars.get(ID_KALENDARZA_FIRMOWEGO); }
  catch (e) { return "BRAK DOSTĘPU DO KALENDARZA FIRMOWEGO.\n\nBłąd Google: " + e.message; }
  return null;
}

// ============================================================
// PRZEBIEG GŁÓWNY
// ============================================================
function przetworzWszystko(dryRun) {
  var w = {
    przetworzone: 0, utworzone: 0, odtworzone: 0, zaktualizowane: 0, bezZmian: 0,
    usuniete: 0, pominiete: 0, bledy: 0, zmianyStatusu: 0,
    zPliku_zKalendarza: 0, konflikty: 0, zaimportowane: 0, doPoczekalni: 0,
    usunieteZadania: 0, przerwane: null,
    znaneEventId: {}, widzianeId: {}, zeskanowaneProjekty: {}, fazaSyncOk: false,
    raport: [["Plik / źródło", "Wiersz", "Temat", "Wynik", "Szczegóły"]]
  };

  if (dryRun) {
    w.raport.push(["⚠️ TRYB PRÓBNY", "-", "-", "NIC NIE ZOSTAŁO ZAPISANE",
      "To wynik Diagnostyki. Aby cokolwiek zmienić, uruchom „📥 Synchronizuj (w obie strony)”."]);
  }

  // Różnica stref czasowych potrafi przesuwać daty całodniowe o dobę.
  var tzArkusza = strefa();
  var tzSkryptu = Session.getScriptTimeZone();
  if (tzArkusza !== tzSkryptu) {
    w.raport.push(["⚠️ STREFY CZASOWE", "-", "-", "RÓŻNE STREFY – POPRAW TO",
      "Arkusz: " + tzArkusza + ", projekt Apps Script: " + tzSkryptu +
      ". Ustaw obie na tę samą strefę (Ustawienia arkusza oraz Ustawienia projektu w edytorze), " +
      "inaczej daty całodniowe mogą się przesuwać."]);
  }

  // Baza główna musi być rozpoznana JEDNOZNACZNIE – inaczej groziłby zapis
  // (i czyszczenie) przypadkowej zakładki.
  var centralSheet = znajdzBazeGlowna();
  if (!centralSheet) {
    w.przerwane = "Nie znaleziono bazy głównej. Żadna zakładka nie ma w komórce A1 tekstu „ID Systemowe”.";
    w.raport.push(["-", "-", "-", "PRZERWANE", w.przerwane]);
    return w;
  }

  var indeks = null;
  bezpiecznie(w, "odczyt plików projektowych", function () { indeks = indeksProjektow(w); });
  if (!indeks) {
    w.przerwane = "Nie udało się odczytać plików projektowych.";
    return w;
  }
  if (indeks.pliki.length === 0) {
    w.raport.push(["-", "-", "-", "BRAK PLIKÓW",
      "W folderze projektów (ani w podfolderach) nie ma arkusza, którego nazwa zaczyna się od „" + ZNACZNIK_PLIKU_ZADAN + "” i który ma kartę z „Temat” w A1."]);
    return w;
  }

  if (IMPORT_Z_KALENDARZA) {
    bezpiecznie(w, "poczekalnia → pliki projektowe", function () { przetworzPoczekalnie(indeks, dryRun, w); });
  }
  bezpiecznie(w, "wymiana plik ↔ kalendarz", function () { synchronizujPliki(indeks, centralSheet, dryRun, w); });
  if (IMPORT_Z_KALENDARZA) {
    bezpiecznie(w, "import wydarzeń → poczekalnia", function () { zbierzNoweWydarzenia(indeks, dryRun, w); });
  }
  if (SPRZATAJ_OSIEROCONE) {
    bezpiecznie(w, "sprzątanie osieroconych zadań", function () { posprzatajOsierocone(centralSheet, dryRun, w); });
  }

  return w;
}

function bezpiecznie(w, nazwaFazy, fn) {
  try { fn(); }
  catch (e) {
    w.bledy++;
    w.raport.push(["⛔ FAZA: " + nazwaFazy, "-", "-", "PRZERWANA BŁĘDEM: " + e.message,
                   String(e.stack || "").substring(0, 800)]);
    Logger.log("FAZA „" + nazwaFazy + "” :: " + (e.stack || e.message));
  }
}

// ============================================================
// INDEKS PLIKÓW PROJEKTOWYCH
// Arkusz zadań rozpoznajemy po nagłówku, NIE po pozycji karty.
// ============================================================
function indeksProjektow(w) {
  var wynik = { pliki: [], nazwy: [], mapa: {} };
  var bezZnacznika = 0;

  // Jedno przejście po drzewie folderów. Dla każdego arkusza dwa warunki, od
  // najtańszego: najpierw znacznik „#” w nazwie (znany z listingu Dysku, bez
  // otwierania pliku), potem karta z „Temat” w A1.
  var doOdwiedzenia = [DriveApp.getFolderById(ID_FOLDERU_PROJEKTOW)];
  while (doOdwiedzenia.length) {
    var folder = doOdwiedzenia.pop();

    var podfoldery = folder.getFolders();
    while (podfoldery.hasNext()) doOdwiedzenia.push(podfoldery.next());

    var wFolderze = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (wFolderze.hasNext()) {
      var f = wFolderze.next();

      // 1. Znacznik w nazwie – plik bez niego NIE jest nawet otwierany.
      if (f.getName().charAt(0) !== ZNACZNIK_PLIKU_ZADAN) { bezZnacznika++; continue; }

      var ss;
      try { ss = SpreadsheetApp.open(f); }
      catch (e) {
        w.raport.push([f.getName(), "-", "-", "POMINIĘTY PLIK", "Nie udało się otworzyć: " + e.message]);
        continue;
      }

      // 2. Karta z zadaniami.
      var arkusz = znajdzArkuszZadan(ss);
      if (!arkusz) {
        w.raport.push([f.getName(), "-", "-", "POMINIĘTY PLIK",
          "Żadna karta nie ma w komórce A1 nagłówka „Temat”. Plik jest ignorowany w całości – " +
          "zadania z tego projektu NIE zostaną uznane za skasowane."]);
        continue;
      }

      var info = pobierzFolderIProjekt(f);
      var rec = {
        file: f, sheet: arkusz,
        nazwaProjektu: info.projectName,
        folderLink: info.folder ? info.folder.getUrl() : "",
        plikLink: f.getUrl(),
        nazwaPliku: f.getName()
      };
      wynik.pliki.push(rec);
      if (!wynik.mapa[rec.nazwaProjektu]) {
        wynik.mapa[rec.nazwaProjektu] = rec;
        wynik.nazwy.push(rec.nazwaProjektu);
      }
    }
  }

  if (bezZnacznika) {
    w.raport.push(["-", "-", "-", "POMINIĘTE BEZ ZNACZNIKA",
      bezZnacznika + " arkusz(y) w skanowanych folderach nie zaczyna się od „" + ZNACZNIK_PLIKU_ZADAN +
      "” – nie zostały nawet otwarte."]);
  }
  return wynik;
}

function znajdzArkuszZadan(ss) {
  var arkusze = ss.getSheets();
  for (var i = 0; i < arkusze.length; i++) {
    if (str(arkusze[i].getRange(1, 1).getValue()).toLowerCase() === NAGLOWEK_ARKUSZA_ZADAN) return arkusze[i];
  }
  return null;
}

function znajdzBazeGlowna() {
  var arkusze = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < arkusze.length; s++) {
    if (str(arkusze[s].getRange(1, 1).getValue()).toLowerCase() === NAGLOWEK_BAZY_GLOWNEJ) return arkusze[s];
  }
  return null;
}

// ============================================================
// FAZA 2 – WYMIANA DWUKIERUNKOWA
// ============================================================
function synchronizujPliki(indeks, centralSheet, dryRun, w) {
  var centralData = centralSheet.getDataRange().getValues();
  var centralMap = {};
  for (var c = 1; c < centralData.length; c++) {
    if (centralData[c][0]) centralMap[str(centralData[c][0])] = c + 1;
  }

  for (var p = 0; p < indeks.pliki.length; p++) {
    var rec   = indeks.pliki[p];
    var sheet = rec.sheet;

    if (!dryRun) {
      if (sheet.getMaxColumns() < KOL_OSTATNIA_SYSTEMOWA) {
        sheet.insertColumnsAfter(sheet.getMaxColumns(), KOL_OSTATNIA_SYSTEMOWA - sheet.getMaxColumns());
      }
      zapewnijNaglowkiSystemowe(sheet);
    }

    var data = sheet.getDataRange().getValues();

    // Rejestracja wszystkich identyfikatorów PRZED przetwarzaniem – awaria
    // pojedynczego wiersza nie może sprawić, że zadanie uzna się za skasowane.
    for (var q = 0; q < data.length; q++) {
      var qid = str(data[q][KOL.idSystemowe - 1]);
      if (qid) w.widzianeId[qid] = true;
    }

    for (var i = 1; i < data.length; i++) {
      var row    = data[i];
      var wiersz = i + 1;
      var temat0 = row[KOL.temat - 1];
      if (!temat0 || str(temat0) === "") continue;

      w.przetworzone++;
      try {
        synchronizujWiersz(rec, sheet, row, wiersz, dryRun, w, centralSheet, centralMap);
      } catch (e) {
        w.bledy++;
        w.raport.push([rec.nazwaPliku, wiersz, str(temat0), "BŁĄD WIERSZA: " + e.message,
                       String(e.stack || "").substring(0, 500)]);
        Logger.log("Wiersz " + wiersz + " w " + rec.nazwaPliku + " :: " + (e.stack || e.message));
      }
    }

    // Projekt liczy się jako zeskanowany DOPIERO po przejściu całego pliku.
    w.zeskanowaneProjekty[rec.nazwaProjektu] = true;
  }
  w.fazaSyncOk = true;
}

function synchronizujWiersz(rec, sheet, row, wiersz, dryRun, w, centralSheet, centralMap) {
  var pTemat = str(row[KOL.temat - 1]);
  var pOpis  = str(row[KOL.opis - 1]);
  var pEmail = str(row[KOL.email - 1]);
  var pUwagi = str(row[KOL.uwagi - 1]);
  var status = str(row[KOL.status - 1]) || "Planowane";

  var dOd = naDate(row[KOL.dataOd - 1]);
  var dDo = naDate(row[KOL.dataDo - 1]);
  var pOd = dOd ? fmt(dOd) : "";
  var pDo = dDo ? fmt(dDo) : "";

  var idSystemowe = str(row[KOL.idSystemowe - 1]);
  var calendarId  = str(row[KOL.idKalendarza - 1]);
  var mig         = parsujMigawke(row[KOL.migawka - 1]);

  if (!idSystemowe) {
    idSystemowe = "ZAD-" + Utilities.getUuid().split('-')[0].toUpperCase();
    if (!dryRun) sheet.getRange(wiersz, KOL.idSystemowe).setValue(idSystemowe);
  }
  w.widzianeId[idSystemowe] = true;

  // ---------- odnalezienie wydarzenia ----------
  var idPrzed = calendarId;
  var zywe = pobierzZyweWydarzenie(calendarId);   // rzuca wyjątkiem przy błędzie łączności
  var martweId = false;
  if (calendarId && !zywe) {
    zywe = znajdzPoZnaczniku(idSystemowe);
    if (zywe) { calendarId = zywe.id; if (!dryRun) sheet.getRange(wiersz, KOL.idKalendarza).setValue(calendarId); }
    else { martweId = true; if (!dryRun) sheet.getRange(wiersz, KOL.idKalendarza).clearContent(); calendarId = ""; }
  }
  if (calendarId) w.znaneEventId[calendarId] = true;

  // ---------- wartości z kalendarza (pusto = brak danych, nie zmiana) ----------
  var kTemat = null, kOpis = null, kEmail = null, kOd = null, kDo = null;
  var notatkaKalendarza = "";
  if (zywe) {
    kTemat = wyluskajTemat(zywe.summary) || null;
    kOpis  = wyluskajOpis(zywe.description);
    kEmail = emailUczestnika(zywe) || null;
    kOd    = dataStartu(zywe);
    kDo    = dataKonca(zywe);
    notatkaKalendarza = notatkaUczestnika(zywe, pEmail) || "";
  }

  var rTemat = rozstrzygnij(pTemat, kTemat, mig ? mig.t  : null);
  var rOpis  = rozstrzygnij(pOpis,  kOpis,  mig ? mig.o  : null);
  var rEmail = rozstrzygnij(pEmail, kEmail, mig ? mig.e  : null);
  var rOd    = rozstrzygnij(pOd,    kOd,    mig ? mig.od : null);
  var rDo    = rozstrzygnij(pDo,    kDo,    mig ? mig["do"] : null);

  // ---------- notatka z RSVP („Dodaj notatkę”) -> DOKLEJANA do Uwagi, nie nadpisuje ----------
  var ostatniaWchloniettaNotatka = str(row[KOL.ostatniaNotatkaKalendarza - 1]);
  var znacznikCzasuNotatki = Utilities.formatDate(new Date(), strefa(), "yyyy-MM-dd HH:mm");
  var wynikNotatki = dopiszNotatkeZKalendarza(pUwagi, notatkaKalendarza, ostatniaWchloniettaNotatka, znacznikCzasuNotatki);
  var uwagiZKalendarza = wynikNotatki.zmiana;
  var pUwagiNowe = wynikNotatki.wartosc;

  var opisZmian = [];
  [["temat", rTemat], ["opis", rOpis], ["uczestnik", rEmail],
   ["data od", rOd], ["data do", rDo]].forEach(function (para) {
    if (para[1].zrodlo === "kalendarz") { opisZmian.push(para[0] + " ← kalendarz"); w.zPliku_zKalendarza++; }
    if (para[1].zrodlo === "konflikt")  { opisZmian.push(para[0] + " KONFLIKT → wygrał plik"); w.konflikty++; }
  });
  if (uwagiZKalendarza) { opisZmian.push("notatki ← dopisano notatkę z kalendarza"); w.zPliku_zKalendarza++; }

  if (!dryRun) {
    if (rTemat.zrodlo === "kalendarz") sheet.getRange(wiersz, KOL.temat).setValue(rTemat.wartosc);
    if (rOpis.zrodlo  === "kalendarz") sheet.getRange(wiersz, KOL.opis).setValue(rOpis.wartosc);
    if (rEmail.zrodlo === "kalendarz") sheet.getRange(wiersz, KOL.email).setValue(rEmail.wartosc);
    if (uwagiZKalendarza) {
      sheet.getRange(wiersz, KOL.uwagi).setValue(pUwagiNowe);
      sheet.getRange(wiersz, KOL.ostatniaNotatkaKalendarza).setValue(notatkaKalendarza);
    }
    if (rOd.zrodlo    === "kalendarz") sheet.getRange(wiersz, KOL.dataOd).setNumberFormat("yyyy-mm-dd").setValue(dataDoKomorki(rOd.wartosc));
    if (rDo.zrodlo    === "kalendarz") sheet.getRange(wiersz, KOL.dataDo).setNumberFormat("yyyy-mm-dd").setValue(dataDoKomorki(rDo.wartosc));
  }

  pTemat = rTemat.wartosc; pOpis = rOpis.wartosc; pEmail = rEmail.wartosc; pUwagi = pUwagiNowe;
  pOd = rOd.wartosc; pDo = rDo.wartosc;
  dOd = naDate(pOd); dDo = naDate(pDo);

  // ---------- odpowiedź na zaproszenie -> status ----------
  var notatkaStatus = "";
  var odpowiedz   = odczytajOdpowiedz(zywe, pEmail);   // wyłącznie osoba z kolumny C
  var ostatniaOdp = str(row[KOL.ostatniaOdpowiedz - 1]);

  if (AUTO_STATUS_Z_KALENDARZA && odpowiedz) {
    var docelowy = MAPA_ODPOWIEDZI[odpowiedz] || "";
    if (odpowiedz !== ostatniaOdp && docelowy && docelowy.toLowerCase() !== status.toLowerCase()) {
      notatkaStatus = "status: „" + etykietaOdpowiedzi(odpowiedz) + "” → " + status + " ⇒ " + docelowy;
      status = docelowy;
      w.zmianyStatusu++;
      if (!dryRun) sheet.getRange(wiersz, KOL.status).setValue(docelowy);
    }
    if (!dryRun && odpowiedz !== ostatniaOdp) sheet.getRange(wiersz, KOL.ostatniaOdpowiedz).setValue(odpowiedz);
    if (odpowiedz !== ostatniaOdp) ostatniaOdp = odpowiedz;

    if (!jestZamkniety(status) && ostatniaOdp === "accepted" && odpowiedz === "accepted") {
      if (!dryRun && zresetujOdpowiedz(calendarId, zywe, pEmail)) {
        sheet.getRange(wiersz, KOL.ostatniaOdpowiedz).setValue("needsAction");
        notatkaStatus += (notatkaStatus ? " | " : "") + "zadanie otwarte ponownie – odpowiedź wyzerowana";
      }
    }
  }

  if (martweId) {
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "WYKRYTO MARTWE ID",
      "Wydarzenie " + idPrzed + " nie istnieje. Kolumna " + literaKolumny(KOL.idKalendarza) +
      " wyczyszczona. Status: „" + status + "” ⇒ " +
      (jestAnulowane(status) ? "zadanie anulowane, nowe wydarzenie NIE powstanie"
                             : "poniżej powinien być wiersz „Utworzone (odtworzone …)”")]);
  }

  // ---------- baza główna ----------
  var rowData = [idSystemowe, rec.nazwaProjektu, pTemat, pOpis, pEmail,
                 dataDoKomorki(pOd), dataDoKomorki(pDo), status, pUwagi, rec.plikLink, rec.folderLink];
  if (!dryRun) {
    var wierszBazy;
    if (centralMap[idSystemowe]) {
      wierszBazy = centralMap[idSystemowe];
      centralSheet.getRange(wierszBazy, 1, 1, 11).setValues([rowData]);
    } else {
      centralSheet.appendRow(rowData);
      wierszBazy = centralSheet.getLastRow();
      centralMap[idSystemowe] = wierszBazy;
    }
    // bez tego baza pokazywała datę razem z godziną
    centralSheet.getRange(wierszBazy, 6, 1, 2).setNumberFormat("yyyy-mm-dd");
  }

  var szczegoly = (opisZmian.length ? opisZmian.join(", ") + " | " : "") +
                  (notatkaStatus ? notatkaStatus + " | " : "");

  if (!dOd || !dDo) {
    w.pominiete++;
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "POMINIĘTE – złe daty",
      szczegoly + "Kol." + literaKolumny(KOL.dataOd) + " = " + opisWartosci(row[KOL.dataOd - 1]) +
      " | Kol." + literaKolumny(KOL.dataDo) + " = " + opisWartosci(row[KOL.dataDo - 1])]);
    if (!dryRun) sheet.getRange(wiersz, KOL.ostatniStatus).setValue(status);
    return;
  }
  if (pDo < pOd) {
    w.pominiete++;
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "POMINIĘTE – data końca przed startem", szczegoly + pOd + " → " + pDo]);
    if (!dryRun) sheet.getRange(wiersz, KOL.ostatniStatus).setValue(status);
    return;
  }

  // Naprawiamy daty tekstowe ORAZ daty z doczepioną godziną – system operuje
  // wyłącznie na całych dniach, więc godzina w komórce to zawsze śmieć.
  if (NAPRAW_DATY_W_ARKUSZU && !dryRun) {
    if (!(row[KOL.dataOd - 1] instanceof Date) || maGodzine(row[KOL.dataOd - 1]))
      sheet.getRange(wiersz, KOL.dataOd).setNumberFormat("yyyy-mm-dd").setValue(dataDoKomorki(pOd));
    if (!(row[KOL.dataDo - 1] instanceof Date) || maGodzine(row[KOL.dataDo - 1]))
      sheet.getRange(wiersz, KOL.dataDo).setNumberFormat("yyyy-mm-dd").setValue(dataDoKomorki(pDo));
  }

  if (dryRun) {
    var co;
    if (jestAnulowane(status) && USUN_ANULOWANE_Z_KALENDARZA)
      co = calendarId ? "USUNIĘCIE wydarzenia (anulowane)" : "nic – anulowane, brak wydarzenia";
    else if (calendarId) co = "aktualizacja wydarzenia";
    else co = "UTWORZENIE wydarzenia";
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "OK – " + co,
      szczegoly + pOd + " → " + pDo + " | status: " + status +
      " | odpowiedź: " + etykietaOdpowiedzi(odpowiedz)]);
    return;
  }

  var wynik = zapiszWydarzenie(zywe, calendarId, idSystemowe, pTemat, pOpis, pUwagi, pEmail,
                               pOd, pDo, rec, status);

  var migawkaWolno = false;

  if (wynik.status === "ERROR") {
    w.bledy++;
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "BŁĄD KALENDARZA", szczegoly + wynik.komunikat]);
  } else if (wynik.status === "DELETED") {
    w.usuniete++; migawkaWolno = true;
    sheet.getRange(wiersz, KOL.idKalendarza).clearContent();
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "Usunięte z kalendarza", szczegoly + "status: " + status]);
  } else if (wynik.status === "SKIPPED") {
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "Poza kalendarzem (zamknięte)", szczegoly + "status: " + status]);
  } else if (wynik.status === "CREATED") {
    if (martweId) w.odtworzone++; else w.utworzone++;
    migawkaWolno = true;
    sheet.getRange(wiersz, KOL.idKalendarza).setValue(wynik.id);
    w.raport.push([rec.nazwaPliku, wiersz, pTemat,
      "Utworzone" + (martweId ? " (odtworzone – stare ID martwe)" : ""),
      szczegoly + pOd + " → " + pDo + " | " + (wynik.link || "")]);
  } else if (wynik.status === "UNCHANGED") {
    w.bezZmian++; migawkaWolno = true;
    if (szczegoly) w.raport.push([rec.nazwaPliku, wiersz, pTemat, "Bez zmian w kalendarzu", szczegoly]);
  } else {
    w.zaktualizowane++; migawkaWolno = true;
    w.raport.push([rec.nazwaPliku, wiersz, pTemat, "Zaktualizowane", szczegoly + pOd + " → " + pDo]);
  }

  sheet.getRange(wiersz, KOL.ostatniStatus).setValue(status);

  // Migawkę wolno odświeżyć TYLKO wtedy, gdy kalendarz naprawdę przyjął te wartości.
  // Inaczej nieudany zapis cofnąłby edycję użytkownika przy następnym przebiegu.
  if (migawkaWolno) {
    sheet.getRange(wiersz, KOL.migawka).setValue(zbudujMigawke(pTemat, pOpis, pEmail, pOd, pDo, pUwagi));
  }
}

// ============================================================
// ROZSTRZYGANIE
// ============================================================
function rozstrzygnij(zPliku, zKalendarza, zMigawki) {
  if (zKalendarza === null || zKalendarza === undefined) return { wartosc: zPliku, zrodlo: "plik" };
  if (zMigawki === null || zMigawki === undefined)       return { wartosc: zPliku, zrodlo: "plik" };

  var zmienionyPlik = norm(zPliku)      !== norm(zMigawki);
  var zmienionyKal  = norm(zKalendarza) !== norm(zMigawki);

  if (zmienionyPlik && zmienionyKal) return { wartosc: zPliku,      zrodlo: "konflikt" };
  if (zmienionyKal)                  return { wartosc: zKalendarza, zrodlo: "kalendarz" };
  return { wartosc: zPliku, zrodlo: "plik" };
}

// v16: notatka z RSVP-komentarza NIGDY nie nadpisuje całej kolumny Uwagi –
// zamiast tego dokleja się jako kolejna linia z datą (tak jak notatki dodawane
// wprost w pliku), o ile to komentarz INNY niż ten, który już raz wchłonęliśmy
// (inaczej ten sam komentarz doklejałby się przy każdej kolejnej synchronizacji).
function dopiszNotatkeZKalendarza(pUwagi, notatkaKalendarza, ostatniaWchlonieta, znacznikCzasu) {
  if (!notatkaKalendarza || norm(notatkaKalendarza) === norm(ostatniaWchlonieta)) {
    return { zmiana: false, wartosc: pUwagi };
  }
  var nowa = (pUwagi ? pUwagi + "\n" : "") + "[" + znacznikCzasu + " z kalendarza] " + notatkaKalendarza;
  return { zmiana: true, wartosc: nowa };
}

function zbudujMigawke(t, o, e, od, doo, u) {
  return JSON.stringify({ t: t, o: o, e: e, od: od, "do": doo, u: u });
}
function parsujMigawke(v) {
  if (!v) return null;
  try { var m = JSON.parse(v.toString()); return (m && typeof m === "object") ? m : null; }
  catch (e) { return null; }
}

// ============================================================
// ZAPIS WYDARZENIA
// ============================================================
function zapiszWydarzenie(zywe, calendarId, zadanieId, temat, opis, uwagi, email, isoOd, isoDo, rec, status) {
  var anulowane = jestAnulowane(status);

  // Tylko „Anulowane” usuwa wydarzenie. „Ukończone” leci dalej normalną ścieżką
  // aktualizacji – zostaje w kalendarzu, dostaje tylko prefiks/kolor „zamknięte”.
  if (anulowane && USUN_ANULOWANE_Z_KALENDARZA) {
    if (!calendarId || !zywe) return { status: "SKIPPED", id: "" };
    var znacznik = znacznikZadania(zywe);
    if (znacznik && znacznik !== zadanieId) {
      return { status: "ERROR", id: calendarId,
        komunikat: "NIE USUNIĘTO. Wydarzenie " + calendarId + " należy do zadania " + znacznik +
                   ", a nie do " + zadanieId + ". Najczęstsza przyczyna: skopiowany wiersz razem z kolumną " +
                   literaKolumny(KOL.idKalendarza) + "." };
    }
    try { Calendar.Events.remove(ID_KALENDARZA_FIRMOWEGO, calendarId); }
    catch (e) { return { status: "ERROR", id: calendarId, komunikat: "Nie udało się usunąć wydarzenia: " + e.message }; }
    return { status: "DELETED", id: "" };
  }

  var stringOd = isoOd;
  var stringDo = dniPlus(isoDo, 1);                  // end.date jest WYŁĄCZNE
  var tytul    = prefiksStatusu(status) + "[" + bezpiecznaNazwaProjektu(rec.nazwaProjektu) + "] " + temat;
  var kolor    = kolorStatusu(status);
  var pelnyOpis = zbudujOpis(opis, rec.nazwaProjektu, status, uwagi);

  var zalaczniki = [];
  if (rec.folderLink) zalaczniki.push({ fileUrl: rec.folderLink, title: "📁 Folder Projektu" });
  if (rec.plikLink)   zalaczniki.push({ fileUrl: rec.plikLink,   title: "📄 Plik z Zadaniami" });

  var wlasciwosci = { private: { zadanieId: zadanieId, projekt: String(rec.nazwaProjektu), zrodlo: "sync" } };

  var opcje = { supportsAttachments: true };
  opcje.sendUpdates = (anulowane || !POWIADAMIAJ_UCZESTNIKOW) ? "none" : "all";

  var docelowyEmail = (email && email.toString().indexOf("@") !== -1) ? email.toString().trim() : "";

  try {
    if (zywe && calendarId) {
      var trzebaZmienicGosci = false;
      if (docelowyEmail && !maUczestnika(zywe, docelowyEmail)) trzebaZmienicGosci = true;

      var bezZmian =
        str(zywe.summary) === str(tytul) &&
        str(zywe.description) === str(pelnyOpis) &&
        zywe.start && zywe.start.date === stringOd &&
        zywe.end && zywe.end.date === stringDo &&
        String(zywe.colorId || "") === String(kolor) &&
        znacznikZadania(zywe) === zadanieId &&
        !zywe.guestsCanModify &&
        !trzebaZmienicGosci;

      if (bezZmian) return { status: "UNCHANGED", id: calendarId, link: zywe.htmlLink };

      zywe.summary            = tytul;
      zywe.description        = pelnyOpis;
      zywe.start              = { date: stringOd };
      zywe.end                = { date: stringDo };
      zywe.colorId            = kolor;
      zywe.attachments        = zalaczniki;
      zywe.extendedProperties = wlasciwosci;
      // Etap 1 wdrożenia: goście nie edytują wydarzenia
      // bezpośrednio w kalendarzu, tylko przez plik. Wymusza to też na wydarzeniach
      // utworzonych wcześniej (gdy jeszcze było guestsCanModify: true).
      zywe.guestsCanModify    = false;

      // Gości NIGDY nie czyścimy. Dopisujemy osobę z pliku; podmieniamy tylko wtedy,
      // gdy gość jest dokładnie jeden – wtedy to ewidentnie zmiana odpowiedzialnego.
      if (trzebaZmienicGosci) {
        var lista = zywe.attendees || [];
        if (lista.length === 1) zywe.attendees = [{ email: docelowyEmail }];
        else { lista.push({ email: docelowyEmail }); zywe.attendees = lista; }
      }

      var upd = Calendar.Events.update(zywe, ID_KALENDARZA_FIRMOWEGO, calendarId, opcje);
      return { status: "UPDATED", id: calendarId, link: upd.htmlLink };
    }

    var zasob = {
      summary: tytul, description: pelnyOpis,
      start: { date: stringOd }, end: { date: stringDo },
      transparency: "transparent", colorId: kolor,
      guestsCanModify: false, attendees: [], attachments: zalaczniki,
      extendedProperties: wlasciwosci
    };
    if (docelowyEmail) zasob.attendees.push({ email: docelowyEmail });

    var nowy = Calendar.Events.insert(zasob, ID_KALENDARZA_FIRMOWEGO, opcje);
    return { status: "CREATED", id: nowy.id, link: nowy.htmlLink };

  } catch (e) {
    Logger.log("BŁĄD „" + temat + "”: " + e.message);
    return { status: "ERROR", id: calendarId, komunikat: e.message };
  }
}

// ============================================================
// FAZA 4 – SPRZĄTANIE OSIEROCONYCH
// ============================================================
function posprzatajOsierocone(centralSheet, dryRun, w) {
  if (!w.fazaSyncOk) {
    w.raport.push(["SPRZĄTANIE", "-", "-", "WSTRZYMANE",
      "Faza synchronizacji nie zakończyła się poprawnie – usuwanie wstrzymane."]);
    return;
  }

  var d = centralSheet.getDataRange().getValues();
  var doUsuniecia = [];

  for (var r = 1; r < d.length; r++) {
    var id      = str(d[r][0]);
    var projekt = str(d[r][1]);
    if (!id) continue;
    if (!projekt || !w.zeskanowaneProjekty[projekt]) continue;
    if (w.widzianeId[id]) continue;
    doUsuniecia.push({ wiersz: r + 1, id: id, projekt: projekt, temat: str(d[r][2]) });
  }

  if (doUsuniecia.length === 0) return;

  if (doUsuniecia.length > MAKS_USUNIEC_NA_PRZEBIEG) {
    w.raport.push(["SPRZĄTANIE", "-", "-", "WSTRZYMANE – za dużo naraz",
      "Wykryto " + doUsuniecia.length + " osieroconych zadań przy limicie " + MAKS_USUNIEC_NA_PRZEBIEG +
      ". Nic nie usunięto. Sprawdź najpierw, czy któryś plik projektowy nie został opróżniony " +
      "albo czy nie zmieniła się nazwa folderu projektu."]);
    return;
  }

  for (var i = 0; i < doUsuniecia.length; i++) {
    var poz = doUsuniecia[i];
    if (dryRun) {
      w.raport.push(["BAZA GŁÓWNA", poz.wiersz, poz.temat, "DO USUNIĘCIA (osierocone)",
        "brak w pliku projektu „" + poz.projekt + "” | ID: " + poz.id]);
      continue;
    }
    var los = "wydarzenia nie było";
    var ev = znajdzPoZnaczniku(poz.id);
    if (ev) {
      try { Calendar.Events.remove(ID_KALENDARZA_FIRMOWEGO, ev.id); los = "wydarzenie usunięte"; }
      catch (e) { los = "NIE UDAŁO SIĘ usunąć wydarzenia: " + e.message; }
    }
    w.usunieteZadania++;
    w.raport.push(["BAZA GŁÓWNA", poz.wiersz, poz.temat, "USUNIĘTE (osierocone)",
      "brak w pliku projektu „" + poz.projekt + "” | ID: " + poz.id + " | " + los]);
  }

  if (dryRun) return;
  doUsuniecia.sort(function (a, b) { return b.wiersz - a.wiersz; });
  for (var q = 0; q < doUsuniecia.length; q++) centralSheet.deleteRow(doUsuniecia[q].wiersz);
}

// ============================================================
// FAZA 1 – POCZEKALNIA -> PLIKI
// ============================================================
function przetworzPoczekalnie(indeks, dryRun, w) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ARKUSZ_POCZEKALNIA);
  if (!sh || sh.getLastRow() < 2) return;

  var d = sh.getDataRange().getValues();

  for (var r = d.length - 1; r >= 1; r--) {
    var eventId = str(d[r][POCZ.idWydarzenia - 1]);
    var projekt = str(d[r][POCZ.projekt - 1]);
    if (!eventId || !projekt) continue;

    var cel = indeks.mapa[projekt];
    if (!cel) {
      w.raport.push([ARKUSZ_POCZEKALNIA, r + 1, str(d[r][POCZ.temat - 1]), "BŁĄD IMPORTU",
        "Brak pliku dla projektu „" + projekt + "”. Dostępne: " + indeks.nazwy.join(", ")]);
      continue;
    }
    if (dryRun) {
      w.raport.push([ARKUSZ_POCZEKALNIA, r + 1, str(d[r][POCZ.temat - 1]), "DO IMPORTU", "trafi do: " + cel.nazwaPliku]);
      continue;
    }

    var email = str(d[r][POCZ.email - 1]);

    // Stan odpowiedzi zapamiętujemy JUŻ TERAZ. Bez tego wcześniejsze „Tak” na
    // prawdziwym spotkaniu zostałoby odczytane jako świeże potwierdzenie
    // ukończenia i skasowałoby to spotkanie przy pierwszej synchronizacji.
    var odpNaStarcie = "";
    try { odpNaStarcie = odczytajOdpowiedz(pobierzZyweWydarzenie(eventId), email); } catch (e) { odpNaStarcie = ""; }

    var idSystemowe = "ZAD-" + Utilities.getUuid().split('-')[0].toUpperCase();
    var nowy = [];
    for (var k = 0; k < KOL_OSTATNIA_SYSTEMOWA; k++) nowy.push("");
    nowy[KOL.temat - 1]             = str(d[r][POCZ.temat - 1]);
    nowy[KOL.opis - 1]              = str(d[r][POCZ.opis - 1]);
    nowy[KOL.email - 1]             = email;
    nowy[KOL.dataOd - 1]            = dataDoKomorki(d[r][POCZ.dataOd - 1]);
    nowy[KOL.dataDo - 1]            = dataDoKomorki(d[r][POCZ.dataDo - 1]);
    nowy[KOL.status - 1]            = "Planowane";
    nowy[KOL.idSystemowe - 1]       = idSystemowe;
    nowy[KOL.idKalendarza - 1]      = eventId;
    nowy[KOL.ostatniaOdpowiedz - 1] = odpNaStarcie;

    if (cel.sheet.getMaxColumns() < KOL_OSTATNIA_SYSTEMOWA) {
      cel.sheet.insertColumnsAfter(cel.sheet.getMaxColumns(), KOL_OSTATNIA_SYSTEMOWA - cel.sheet.getMaxColumns());
    }
    zapewnijNaglowkiSystemowe(cel.sheet);

    var miejsce = miejsceNaZadanie(cel.sheet);
    var nowyWiersz = miejsce.wiersz;
    if (nowyWiersz > cel.sheet.getMaxRows()) {
      cel.sheet.insertRowsAfter(cel.sheet.getMaxRows(), nowyWiersz - cel.sheet.getMaxRows());
    }
    cel.sheet.getRange(nowyWiersz, KOL.dataOd, 1, 2).setNumberFormat("yyyy-mm-dd");
    cel.sheet.getRange(nowyWiersz, 1, 1, nowy.length).setValues([nowy]);

    try {
      Calendar.Events.patch(
        { extendedProperties: { private: { zadanieId: idSystemowe, projekt: projekt, zrodlo: "import" } } },
        ID_KALENDARZA_FIRMOWEGO, eventId, { sendUpdates: "none" });
    } catch (e) { Logger.log("Nie oznaczono wydarzenia " + eventId + ": " + e.message); }

    sh.deleteRow(r + 1);
    w.zaimportowane++;
    w.raport.push([cel.nazwaPliku, nowyWiersz, nowy[KOL.temat - 1], "ZAIMPORTOWANE z kalendarza",
      "projekt: " + projekt + " | ID: " + idSystemowe +
      " | umieszczenie: " + (miejsce.wstawiony ? "wstawiono nowy wiersz pod ostatnim zadaniem" : "wypełniono pustą dziurę w tabeli") +
      " (ostatnie zadanie: " + miejsce.koniec + ", ostatni wiersz karty: " + cel.sheet.getLastRow() + ")" +
      (odpNaStarcie ? " | zastana odpowiedź: " + etykietaOdpowiedzi(odpNaStarcie) : "")]);
  }
}

// ============================================================
// FAZA 3 – WYDARZENIA RĘCZNE -> POCZEKALNIA
// ============================================================
function zbierzNoweWydarzenia(indeks, dryRun, w) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = dryRun ? ss.getSheetByName(ARKUSZ_POCZEKALNIA) : zapewnijPoczekalnie(indeks.nazwy);

  // eventId -> {wiersz, temat, opis, email, od, doD} – stan już siedzący w poczekalni.
  // Wiersz z wybranym projektem NIE dotrze tutaj: przetworzPoczekalnie() przenosi go
  // do pliku WCZEŚNIEJ w tym samym przebiegu, więc wszystko, co tu widzimy, wciąż czeka.
  var juz = {};
  if (sh && sh.getLastRow() > 1) {
    var istn = sh.getRange(2, 1, sh.getLastRow() - 1, POCZ.uwagi).getValues();
    for (var q = 0; q < istn.length; q++) {
      var eid = str(istn[q][POCZ.idWydarzenia - 1]);
      if (!eid) continue;
      juz[eid] = {
        wiersz: q + 2,
        temat: str(istn[q][POCZ.temat - 1]),
        opis:  str(istn[q][POCZ.opis - 1]),
        email: str(istn[q][POCZ.email - 1]),
        od:    naDate(istn[q][POCZ.dataOd - 1]),
        doD:   naDate(istn[q][POCZ.dataDo - 1])
      };
    }
  }

  var od  = new Date(); od.setDate(od.getDate() - OKNO_IMPORTU_WSTECZ);
  var doD = new Date(); doD.setDate(doD.getDate() + OKNO_IMPORTU_WPRZOD);

  var token = null, doDopisania = [], doOdswiezenia = [];
  do {
    var resp = Calendar.Events.list(ID_KALENDARZA_FIRMOWEGO, {
      timeMin: od.toISOString(), timeMax: doD.toISOString(),
      showDeleted: false, singleEvents: true, maxResults: 250, pageToken: token
    });
    var items = resp.items || [];
    for (var i = 0; i < items.length; i++) {
      var ev = items[i];
      if (ev.status === "cancelled") continue;
      if (znacznikZadania(ev)) continue;
      if (w.znaneEventId[ev.id]) continue;
      if (ev.recurringEventId) continue;

      var swiezyTemat = wyluskajTemat(ev.summary);
      var swiezyOpis  = wyluskajOpis(ev.description) || "";
      var swiezyEmail = emailUczestnika(ev) || "";
      var swiezaOd    = naDate(dataDoKomorki(dataStartu(ev)));
      var swiezaDo    = naDate(dataDoKomorki(dataKonca(ev)));
      var swiezaUwaga = (ev.start && ev.start.dateTime) ? "wydarzenie godzinowe – przy synchronizacji stanie się całodniowe" : "";

      var istniejacy = juz[ev.id];
      if (istniejacy) {
        // Wydarzenie już czeka w poczekalni – SPRAWDZAMY, czy ktoś zmienił je na
        // kalendarzu od czasu pierwszego zaimportowania, i jeśli tak, odświeżamy wiersz.
        // Wcześniej takie zmiany były po cichu ignorowane aż do wybrania projektu.
        var zmiana =
          istniejacy.temat !== swiezyTemat ||
          istniejacy.opis  !== swiezyOpis  ||
          istniejacy.email !== swiezyEmail ||
          (istniejacy.od  ? fmt(istniejacy.od)  : "") !== (swiezaOd  ? fmt(swiezaOd)  : "") ||
          (istniejacy.doD ? fmt(istniejacy.doD) : "") !== (swiezaDo ? fmt(swiezaDo) : "");
        if (zmiana) {
          doOdswiezenia.push({
            wiersz: istniejacy.wiersz, temat: swiezyTemat, opis: swiezyOpis, email: swiezyEmail,
            od: swiezaOd, doD: swiezaDo, uwaga: swiezaUwaga, link: ev.htmlLink || ""
          });
        }
        continue;
      }

      doDopisania.push([
        ev.id, swiezyTemat, swiezyOpis, swiezyEmail, swiezaOd, swiezaDo, "",
        ev.htmlLink || "",
        Utilities.formatDate(new Date(), strefa(), "yyyy-MM-dd HH:mm"),
        swiezaUwaga
      ]);
    }
    token = resp.nextPageToken;
  } while (token);

  if (dryRun) {
    for (var z = 0; z < doDopisania.length; z++) {
      w.raport.push(["KALENDARZ", "-", doDopisania[z][1], "DO POCZEKALNI",
        "wydarzenie bez projektu, termin " + (doDopisania[z][4] ? fmt(doDopisania[z][4]) : "?") +
        " → " + (doDopisania[z][5] ? fmt(doDopisania[z][5]) : "?")]);
    }
    for (var zz = 0; zz < doOdswiezenia.length; zz++) {
      w.raport.push([ARKUSZ_POCZEKALNIA, doOdswiezenia[zz].wiersz, doOdswiezenia[zz].temat,
        "DO ODŚWIEŻENIA W POCZEKALNI",
        "zmieniono na kalendarzu przed wybraniem projektu – temat/opis/uczestnik/daty zostaną nadpisane"]);
    }
    w.doPoczekalni += doDopisania.length;
    return;
  }

  // Odśwież wiersze już siedzące w poczekalni – tylko dane z kalendarza, kolumny
  // „Projekt” i „Dodano” zostają nietknięte.
  for (var r = 0; r < doOdswiezenia.length; r++) {
    var o = doOdswiezenia[r];
    sh.getRange(o.wiersz, POCZ.temat).setValue(o.temat);
    sh.getRange(o.wiersz, POCZ.opis).setValue(o.opis);
    sh.getRange(o.wiersz, POCZ.email).setValue(o.email);
    sh.getRange(o.wiersz, POCZ.dataOd, 1, 2).setNumberFormat("yyyy-mm-dd").setValues([[o.od, o.doD]]);
    sh.getRange(o.wiersz, POCZ.link).setValue(o.link);
    sh.getRange(o.wiersz, POCZ.uwagi).setValue(o.uwaga);
    w.raport.push([ARKUSZ_POCZEKALNIA, o.wiersz, o.temat, "ODŚWIEŻONE W POCZEKALNI",
      "dane zaktualizowane z kalendarza (zmiana sprzed wyboru projektu)"]);
  }

  if (doDopisania.length === 0) return;
  w.doPoczekalni += doDopisania.length;

  var start = sh.getLastRow() + 1;
  zapewnijPojemnosc(sh, start + doDopisania.length, 10);
  sh.getRange(start, POCZ.dataOd, doDopisania.length, 2).setNumberFormat("yyyy-mm-dd");
  sh.getRange(start, 1, doDopisania.length, 10).setValues(doDopisania);
  ustawListeProjektow(sh, indeks.nazwy);

  for (var y = 0; y < doDopisania.length; y++) {
    w.raport.push(["KALENDARZ", start + y, doDopisania[y][1], "DODANE DO POCZEKALNI",
      "wskaż projekt w „" + ARKUSZ_POCZEKALNIA + "”, kolumna " + literaKolumny(POCZ.projekt)]);
  }
}

function zapewnijPoczekalnie(nazwy) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ARKUSZ_POCZEKALNIA);
  if (!sh) {
    sh = ss.insertSheet(ARKUSZ_POCZEKALNIA);
    sh.appendRow(["ID wydarzenia", "Temat", "Opis", "Uczestnik", "Data od", "Data do",
                  "➜ PROJEKT (wybierz)", "Link do wydarzenia", "Dodano", "Uwagi importu"]);
    sh.getRange(1, 1, 1, 10).setFontWeight("bold");
    sh.setFrozenRows(1);
    sh.setColumnWidth(POCZ.projekt, 200);
    sh.getRange(1, POCZ.projekt).setBackground("#fff2cc");
  }
  ustawListeProjektow(sh, nazwy);
  return sh;
}

function ustawListeProjektow(sh, nazwy) {
  if (!nazwy || !nazwy.length) return;
  var ostatni = Math.max(sh.getLastRow(), 2);
  var regula = SpreadsheetApp.newDataValidation()
    .requireValueInList(nazwy, true).setAllowInvalid(false)
    .setHelpText("Wybierz projekt, do którego należy to zadanie.").build();
  sh.getRange(2, POCZ.projekt, ostatni - 1, 1).setDataValidation(regula);
}

// ============================================================
// OPIS / TYTUŁ
// ============================================================
// v15 – wg ustalonego wzoru opisu: „Opis” to teraz kolejna etykietowana
// linia WEWNĄTRZ stałego bloku (Projekt / Opis / Status / Uwagi), a nie wolny
// tekst NAD nim jak w v14. Blok zawsze zaczyna się od samego początku opisu.
function zbudujOpis(opis, projekt, status, uwagi) {
  return "Projekt: " + projekt + "\n" +
         "Opis: " + (opis || "") + "\n" +
         "Status: " + status + "\n" +
         "Notatki: " + (uwagi || "") + "\n" +
         "\n" + zbudujWskazowke();
}

// Zwraca null, gdy opisu nie da się bezpiecznie odczytać. Wpisanie do arkusza
// całej ramki systemowej byłoby gorsze niż pominięcie parametru.
function wyluskajOpis(description) {
  if (description === null || description === undefined) return null;
  var s = description.toString();

  // v15: skoro blok systemowy zaczyna się od samego początku opisu (linia
  // „Projekt: ...”), a „Opis: ...” jest jego drugą linią, wystarczy wyciągnąć
  // wszystko między etykietą „Opis:” a następującą po niej linią „Status:”.
  // Obsługuje też wieloliniową treść opisu (np. kilka akapitów) – dopóki sama
  // nie zawiera linii zaczynającej się od „Status:”.
  var m = s.match(/^Projekt:[^\n]*\nOpis:[ \t]?([\s\S]*?)\nStatus:[ \t]*[^\n]*\n/);
  if (m) {
    var tresc = m[1].replace(/^\s+|\s+$/g, "");
    return tresc === "" ? null : tresc;
  }

  // Nie znaleziono całego układu w oczekiwanym miejscu (np. wydarzenie
  // utworzone ręcznie, bez naszej sekcji systemowej wcale). Zanim uznamy CAŁĄ
  // treść za opis użytkownika, sprawdzamy, czy to, co jest, nie wygląda na
  // (uszkodzoną) resztkę naszej sekcji systemowej – bez tego jedno drobne
  // rozjechanie formatu potrafiłoby nadpisać kolumnę Opis śmieciem, a przy
  // kolejnej synchronizacji ten śmieć wracałby na kalendarz i narastał
  // (dokładnie ten błąd naprawiono w v13).
  if (/^Projekt:\s/m.test(s) || /^Opis:\s/m.test(s) || /^Status:\s/m.test(s) ||
      /^Uwagi:\s/m.test(s) || /^Notatki:\s/m.test(s) ||
      s.indexOf("Aby edytować") !== -1 || s.indexOf("Dodaj notatkę") !== -1 ||
      s.indexOf("Zmiany wprowadzone w kalendarzu") !== -1) {
    return null;
  }

  var czysty = s.replace(/^\s+|\s+$/g, "");
  return czysty === "" ? null : czysty;
}

function wyluskajTemat(summary) {
  var s = String(summary || "");
  s = s.replace(/^(?:✅|❌|⏸️|⏸|⏳)\s*/, "");
  s = s.replace(/^\[(?:ANULOWANE|WSTRZYMANE|OCZEKUJE)\]\s*/, "");
  s = s.replace(/^\[[^\]]*\]\s*/, "");
  return s.replace(/^\s+|\s+$/g, "");
}

// Nawiasy w nazwie folderu rozwalały późniejsze odczytanie tematu.
function bezpiecznaNazwaProjektu(nazwa) {
  return String(nazwa).replace(/[\[\]]/g, "").replace(/\s/g, "_").toUpperCase();
}

// ============================================================
// ODCZYT Z WYDARZENIA
// ============================================================
function znacznikZadania(ev) {
  return (ev && ev.extendedProperties && ev.extendedProperties.private)
       ? (ev.extendedProperties.private.zadanieId || null) : null;
}

function dataStartu(ev) {
  if (!ev || !ev.start) return null;
  if (ev.start.date) return ev.start.date;
  if (ev.start.dateTime) return Utilities.formatDate(new Date(ev.start.dateTime), strefa(), "yyyy-MM-dd");
  return null;
}

// end.date jest WYŁĄCZNE – realny ostatni dzień to end.date − 1.
// Arytmetyka na łańcuchach w UTC, żeby żadna strefa nie przesunęła wyniku.
function dataKonca(ev) {
  if (!ev || !ev.end) return null;
  if (ev.end.date) return dniPlus(ev.end.date, -1);
  if (ev.end.dateTime) return Utilities.formatDate(new Date(ev.end.dateTime), strefa(), "yyyy-MM-dd");
  return null;
}

function emailUczestnika(ev) {
  if (!ev || !ev.attendees || !ev.attendees.length) return "";
  for (var i = 0; i < ev.attendees.length; i++) {
    var a = ev.attendees[i];
    if (a.resource) continue;
    if (pasujeEmail(a.email, ID_KALENDARZA_FIRMOWEGO)) continue;
    return a.email || "";
  }
  return "";
}

function maUczestnika(ev, email) {
  if (!ev || !ev.attendees) return false;
  for (var i = 0; i < ev.attendees.length; i++) if (pasujeEmail(ev.attendees[i].email, email)) return true;
  return false;
}

function notatkaUczestnika(ev, email) {
  if (!ev || !ev.attendees) return "";
  for (var i = 0; i < ev.attendees.length; i++) {
    var a = ev.attendees[i];
    if (email && !pasujeEmail(a.email, email)) continue;
    if (a.comment) return a.comment;
  }
  return "";
}

// Zwraca null przy braku wydarzenia, RZUCA przy błędzie łączności –
// inaczej chwilowa awaria API kasowała powiązanie i tworzyła duplikat.
// Krótki retry, zanim uznamy wydarzenie za martwe. Tuż po tym, jak
// przetworzPoczekalnie() oznaczy świeżo zaimportowane wydarzenie (Events.patch)
// i w tym samym przebiegu ta funkcja od razu je odczytuje (Events.get), Google
// czasem ma chwilowe opóźnienie w propagacji zmiany. Bez tej drugiej próby
// skrypt brał to za martwe ID i tworzył DRUGIE, zduplikowane wydarzenie,
// zostawiając oryginał osieroconym (bez tytułu projektu i koloru statusu).
function pobierzZyweWydarzenie(calId) {
  if (!calId) return null;
  return pobierzZyweWydarzenieProba(calId, 2);
}
function pobierzZyweWydarzenieProba(calId, prob) {
  try {
    var ev = Calendar.Events.get(ID_KALENDARZA_FIRMOWEGO, calId);
    if (!ev || ev.status === "cancelled") {
      if (prob > 1) { Utilities.sleep(700); return pobierzZyweWydarzenieProba(calId, prob - 1); }
      return null;
    }
    return ev;
  } catch (e) {
    var m = String(e.message || "");
    if (/not found|404|410|gone|deleted|notfound/i.test(m)) {
      if (prob > 1) { Utilities.sleep(700); return pobierzZyweWydarzenieProba(calId, prob - 1); }
      return null;
    }
    throw new Error("Kalendarz nie odpowiedział dla wydarzenia " + calId + ": " + m);
  }
}

// Ten sam powód retry co wyżej – wyszukiwanie po znaczniku (Events.list z filtrem)
// zwykle ma jeszcze większe opóźnienie propagacji niż odczyt po samym ID.
function znajdzPoZnaczniku(zadanieId) {
  if (!zadanieId) return null;
  return znajdzPoZnacznikuProba(zadanieId, 2);
}
function znajdzPoZnacznikuProba(zadanieId, prob) {
  try {
    var resp = Calendar.Events.list(ID_KALENDARZA_FIRMOWEGO, {
      privateExtendedProperty: "zadanieId=" + zadanieId,
      showDeleted: false, singleEvents: true, maxResults: 5
    });
    var items = resp.items || [];
    for (var i = 0; i < items.length; i++) if (items[i].status !== "cancelled") return items[i];
  } catch (e) { Logger.log("Szukanie po znaczniku nieudane: " + e.message); }
  if (prob > 1) { Utilities.sleep(700); return znajdzPoZnacznikuProba(zadanieId, prob - 1); }
  return null;
}

// ============================================================
// ODPOWIEDZI
// ============================================================
// WYŁĄCZNIE osoba z kolumny C. Wcześniejsza ścieżka awaryjna brała odpowiedź
// dowolnego uczestnika, przez co cudze „Tak” zamykało i kasowało zadanie.
function odczytajOdpowiedz(zywe, email) {
  if (!zywe || !zywe.attendees || !email) return "";
  for (var i = 0; i < zywe.attendees.length; i++) {
    var a = zywe.attendees[i];
    if (a.resource) continue;
    if (pasujeEmail(a.email, email)) return a.responseStatus || "needsAction";
  }
  return "";
}

function zresetujOdpowiedz(calId, zywe, email) {
  if (!calId || !zywe || !zywe.attendees || !email) return false;
  var zmieniono = false;
  for (var i = 0; i < zywe.attendees.length; i++) {
    var a = zywe.attendees[i];
    if (!pasujeEmail(a.email, email)) continue;
    if (a.responseStatus !== "needsAction") { a.responseStatus = "needsAction"; zmieniono = true; }
  }
  if (!zmieniono) return false;
  try {
    Calendar.Events.patch({ attendees: zywe.attendees }, ID_KALENDARZA_FIRMOWEGO, calId, { sendUpdates: "none" });
    return true;
  } catch (e) { Logger.log("Reset odpowiedzi nieudany: " + e.message); return false; }
}

function etykietaOdpowiedzi(r) {
  if (r === "accepted") return "Tak";
  if (r === "declined") return "Nie";
  if (r === "tentative") return "Być może";
  if (r === "needsAction") return "brak odpowiedzi";
  return r ? r : "brak uczestnika";
}

function zbudujWskazowke() {
  var t = "─────────────────────────────────\n";
  if (AUTO_STATUS_Z_KALENDARZA) {
    if (MAPA_ODPOWIEDZI.accepted)  t += "✅ SKOŃCZONE? Odpowiedz „Tak” – zadanie zmieni status na „" + MAPA_ODPOWIEDZI.accepted + "”.\n";
    if (MAPA_ODPOWIEDZI.tentative) t += "🔧 ZACZĄŁEŚ? Odpowiedz „Być może” – status zmieni się na „" + MAPA_ODPOWIEDZI.tentative + "”.\n";
    if (MAPA_ODPOWIEDZI.declined)  t += "❌ Odpowiedź „Nie” ustawi status „" + MAPA_ODPOWIEDZI.declined + "”.\n";
    else                           t += "ℹ️ Odpowiedź „Nie” niczego nie zmienia.\n";
  } else {
    // v15: jedna linia, dokładnie wg ustalonego wzoru (poprzednia,
    // osobna linia o odpowiedzi na zaproszenie – usunięta jako redundantna).
    t += "✏️ Zmiany wprowadzone w kalendarzu nie zostaną zapisane. Aby edytować zadanie, otwórz plik z załącznika „📄 Plik z Zadaniami”. Zmiana wróci tu przy najbliższej synchronizacji.\n";
  }
  t += "💬 NOTATKA: Aby dodać kolejną notatkę dot. zadania, kliknij przycisk „Dodaj notatkę” – wpisany tekst " +
       "zostanie dodany z dzisiejszą datą do kolumny „Notatki” w pliku z zadaniami. Aby dodać kolejną notatkę, " +
       "kliknij przycisk „Edytuj notatkę”, usuń wcześniej zapisaną treść i wprowadź nową notatkę.";
  return t;
}

// ============================================================
// RAPORTY POMOCNICZE
// ============================================================
function sprawdzKalendarz() {
  var problem = sprawdzUslugeKalendarza();
  if (problem) { pokazBlad(problem); return; }

  var raport = [["Źródło", "Temat", "Termin", "Stan", "Link / uwaga"]];
  var od  = new Date(); od.setDate(od.getDate() - OKNO_IMPORTU_WSTECZ);
  var doD = new Date(); doD.setDate(doD.getDate() + OKNO_IMPORTU_WPRZOD);

  var token = null, licznik = 0;
  do {
    var resp = Calendar.Events.list(ID_KALENDARZA_FIRMOWEGO, {
      timeMin: od.toISOString(), timeMax: doD.toISOString(),
      showDeleted: false, singleEvents: true, maxResults: 250, pageToken: token
    });
    var items = resp.items || [];
    for (var i = 0; i < items.length; i++) {
      var ev = items[i];
      raport.push(["KALENDARZ", ev.summary || "(bez tytułu)",
                   dataStartu(ev) + " → " + dataKonca(ev),
                   (znacznikZadania(ev) || "BEZ ZNACZNIKA (do poczekalni)"),
                   ev.htmlLink || ""]);
      licznik++;
    }
    token = resp.nextPageToken;
  } while (token);

  if (licznik === 0) raport.push(["KALENDARZ", "(PUSTO)", "-", "-", "Brak wydarzeń w oknie."]);
  raport.push(["", "", "", "", ""]);

  var w = { raport: [] };
  var indeks = indeksProjektow(w);
  for (var p = 0; p < indeks.pliki.length; p++) {
    var rec = indeks.pliki[p];
    var d = rec.sheet.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var t = str(d[r][KOL.temat - 1]);
      if (!t) continue;
      var cid = str(d[r][KOL.idKalendarza - 1]);
      var zrodlo = rec.nazwaPliku + " w." + (r + 1);
      if (!cid) { raport.push([zrodlo, t, "-", "BRAK ID W ARKUSZU", "status: " + str(d[r][KOL.status - 1])]); continue; }
      var ev2 = null;
      try { ev2 = pobierzZyweWydarzenie(cid); } catch (e) { ev2 = null; }
      if (ev2) raport.push([zrodlo, t, dataStartu(ev2) + " → " + dataKonca(ev2),
                            "ŻYWE / odpowiedź: " + etykietaOdpowiedzi(odczytajOdpowiedz(ev2, str(d[r][KOL.email - 1]))),
                            (ev2.htmlLink || "") + "  [" + (ev2.summary || "") + "]"]);
      else     raport.push([zrodlo, t, "-", "MARTWE ID", "Naprawi się przy najbliższej synchronizacji."]);
    }
  }

  zapiszRaportDo(ARKUSZ_RAPORT_KAL, raport.concat(w.raport));
  SpreadsheetApp.getActiveSpreadsheet().toast("Wydarzeń: " + licznik + ". Zobacz „" + ARKUSZ_RAPORT_KAL + "”.", "Gotowe", 20);
}

function diagnostykaImportu() {
  var problem = sprawdzUslugeKalendarza();
  if (problem) { pokazBlad(problem); return; }

  var raport = [["ID wydarzenia", "Tytuł", "Termin", "Decyzja importu", "Powód"]];
  var w = { raport: [] };
  var indeks = indeksProjektow(w);

  var znane = {};
  for (var p = 0; p < indeks.pliki.length; p++) {
    var d = indeks.pliki[p].sheet.getDataRange().getValues();
    for (var r = 1; r < d.length; r++) {
      var cid = str(d[r][KOL.idKalendarza - 1]);
      if (cid) znane[cid] = indeks.pliki[p].nazwaPliku + " w." + (r + 1);
    }
  }

  var wPocz = {};
  var shP = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ARKUSZ_POCZEKALNIA);
  if (shP && shP.getLastRow() > 1) {
    var v = shP.getRange(2, POCZ.idWydarzenia, shP.getLastRow() - 1, 1).getValues();
    for (var q = 0; q < v.length; q++) if (v[q][0]) wPocz[str(v[q][0])] = true;
  }

  var od  = new Date(); od.setDate(od.getDate() - OKNO_IMPORTU_WSTECZ);
  var doD = new Date(); doD.setDate(doD.getDate() + OKNO_IMPORTU_WPRZOD);
  var token = null, licznik = 0, doImportu = 0;

  do {
    var resp = Calendar.Events.list(ID_KALENDARZA_FIRMOWEGO, {
      timeMin: od.toISOString(), timeMax: doD.toISOString(),
      showDeleted: false, singleEvents: true, maxResults: 250, pageToken: token
    });
    var items = resp.items || [];
    for (var i = 0; i < items.length; i++) {
      var ev = items[i]; licznik++;
      var zn = znacznikZadania(ev);
      var decyzja, powod;
      if (ev.status === "cancelled") { decyzja = "POMIJAM"; powod = "wydarzenie anulowane"; }
      else if (zn)                   { decyzja = "POMIJAM"; powod = "ma znacznik zadanieId=" + zn; }
      else if (znane[ev.id])         { decyzja = "POMIJAM"; powod = "ID jest w arkuszu: " + znane[ev.id]; }
      else if (wPocz[ev.id])         { decyzja = "POMIJAM"; powod = "czeka już w " + ARKUSZ_POCZEKALNIA +
                                        " (zmiany na kalendarzu odświeżą ten wiersz przy najbliższej synchronizacji)"; }
      else if (ev.recurringEventId)  { decyzja = "POMIJAM"; powod = "wystąpienie cykliczne"; }
      else { decyzja = "DO POCZEKALNI"; powod = "utworzone poza systemem"; doImportu++; }
      raport.push([ev.id, ev.summary || "(bez tytułu)", dataStartu(ev) + " → " + dataKonca(ev), decyzja,
                   powod + "  |  organizator: " + ((ev.organizer && ev.organizer.email) || "?")]);
    }
    token = resp.nextPageToken;
  } while (token);

  if (licznik === 0) {
    raport.push(["-", "-", "-", "KALENDARZ PUSTY",
      "W oknie −" + OKNO_IMPORTU_WSTECZ + "/+" + OKNO_IMPORTU_WPRZOD + " dni brak wydarzeń. " +
      "Jeśli tworzyłeś je ręcznie, sprawdź, czy na pewno na kalendarzu " + ID_KALENDARZA_FIRMOWEGO + "."]);
  }

  zapiszRaportDo(ARKUSZ_RAPORT_IMPORT, raport.concat(w.raport));
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Wydarzeń: " + licznik + " | do importu: " + doImportu + ". Zobacz „" + ARKUSZ_RAPORT_IMPORT + "”.", "Gotowe", 25);
}

// ============================================================
// POMOCNICZE
// ============================================================
var _strefa = null;
function strefa() {
  if (!_strefa) _strefa = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  return _strefa;
}

// Arytmetyka dat całodniowych wyłącznie na łańcuchach "yyyy-MM-dd" w UTC.
function dniPlus(iso, n) {
  if (!iso) return iso;
  var p = String(iso).split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + "-" + dwa(d.getUTCMonth() + 1) + "-" + dwa(d.getUTCDate());
}
function dwa(n) { return (n < 10 ? "0" : "") + n; }

function zapewnijNaglowkiSystemowe(sheet) {
  var n = sheet.getRange(1, 1, 1, KOL_OSTATNIA_SYSTEMOWA).getValues()[0];
  if (!n[KOL.ostatniStatus - 1])     sheet.getRange(1, KOL.ostatniStatus).setValue("Ostatni status (system)");
  if (!n[KOL.ostatniaOdpowiedz - 1]) sheet.getRange(1, KOL.ostatniaOdpowiedz).setValue("Ostatnia odpowiedź (system)");
  if (!n[KOL.migawka - 1])           sheet.getRange(1, KOL.migawka).setValue("Migawka (system – nie edytuj)");
  if (!n[KOL.ostatniaNotatkaKalendarza - 1])
    sheet.getRange(1, KOL.ostatniaNotatkaKalendarza).setValue("Ostatnia notatka z kalendarza (system)");
  if (UKRYJ_KOLUMNY_SYSTEMOWE && !sheet.isColumnHiddenByUser(KOL.ostatniStatus)) {
    sheet.hideColumns(KOL.ostatniStatus, 4);
  }
}

// Pierwszy wiersz pusty W CAŁOŚCI – sprawdzanie samej kolumny A nadpisywało
// wiersze, w których zostały jeszcze identyfikatory.
// Ostatni wiersz, w którym stoi TEMAT – czyli faktyczny koniec tabeli zadań.
// getLastRow() obejmuje całą kartę, więc dowolna notatka, legenda czy lista
// wartości pod tabelą wypychała nowe zadanie na sam dół arkusza.
function ostatniWierszZadania(sheet) {
  var ostatni = sheet.getLastRow();
  if (ostatni < 2) return 1;
  var kolumna = sheet.getRange(2, KOL.temat, ostatni - 1, 1).getValues();
  for (var i = kolumna.length - 1; i >= 0; i--) {
    if (str(kolumna[i][0]) !== "") return i + 2;
  }
  return 1;
}

// Miejsce na nowe zadanie: pierwsza pusta dziura WEWNĄTRZ tabeli, a gdy jej nie ma –
// wiersz WSTAWIONY zaraz pod ostatnim zadaniem. Wstawienie (a nie zapis niżej) sprawia,
// że nowy wiersz dziedziczy formatowanie tabeli i nie przeskakuje pod treści z dołu karty.
function miejsceNaZadanie(sheet) {
  var koniec = ostatniWierszZadania(sheet);

  if (koniec >= 2) {
    var zakres = sheet.getRange(2, 1, koniec - 1, KOL_OSTATNIA_SYSTEMOWA).getValues();
    for (var i = 0; i < zakres.length; i++) {
      var pusty = true;
      for (var j = 0; j < zakres[i].length; j++) if (str(zakres[i][j]) !== "") { pusty = false; break; }
      if (pusty) return { wiersz: i + 2, wstawiony: false, koniec: koniec };
    }
  }

  var baza = (koniec < 2) ? 1 : koniec;
  sheet.insertRowAfter(baza);
  return { wiersz: baza + 1, wstawiony: true, koniec: koniec };
}

function zapewnijPojemnosc(sh, wierszy, kolumn) {
  if (sh.getMaxRows() < wierszy)    sh.insertRowsAfter(sh.getMaxRows(), wierszy - sh.getMaxRows());
  if (sh.getMaxColumns() < kolumn)  sh.insertColumnsAfter(sh.getMaxColumns(), kolumn - sh.getMaxColumns());
}

function str(v) { return (v === null || v === undefined) ? "" : v.toString().trim(); }
function norm(v) { return (v === null || v === undefined) ? "" : v.toString().trim(); }

function jestZamkniety(s) {
  s = String(s).toLowerCase().trim();
  return s === "ukończone" || s === "ukonczone" || s === "zakończone" || s === "zakonczone" || s === "anulowane";
}

// Osobno od jestZamkniety(): tylko to decyduje o USUNIĘCIU wydarzenia z kalendarza.
// „Ukończone” jest zamknięte, ale NIE anulowane – zostaje w kalendarzu.
function jestAnulowane(s) {
  s = String(s).toLowerCase().trim();
  return s === "anulowane";
}

function prefiksStatusu(status) {
  var s = String(status).toLowerCase().trim();
  if (s === "anulowane")  return "❌ [ANULOWANE] ";
  if (jestZamkniety(s))   return "✅ ";
  if (s === "wstrzymane") return "⏸️ [WSTRZYMANE] ";
  if (s === "oczekujące" || s === "oczekujace") return "⏳ [OCZEKUJE] ";
  return "";
}

function kolorStatusu(status) {
  var s = String(status).toLowerCase().trim();
  if (jestZamkniety(s))   return KOLORY.zamkniete;
  if (s === "w trakcie")  return KOLORY.wTrakcie;
  if (s === "oczekujące" || s === "oczekujace") return KOLORY.oczekujace;
  if (s === "wstrzymane") return KOLORY.wstrzymane;
  if (s === "planowane" || s === "planowanie")  return KOLORY.planowane;
  return KOLORY.domyslny;
}

// Daty tworzone w południe – żeby różnica stref nie przeniosła ich na sąsiedni dzień.
// Odrzuca daty nieistniejące (31.02) zamiast po cichu je przewijać.
function naDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 0) {
    var d = new Date(1899, 11, 30, 12, 0, 0);
    d.setDate(d.getDate() + Math.floor(v));
    return d;
  }
  if (typeof v === 'string') {
    var s = v.trim();
    if (!s) return null;
    var m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
    if (m) return zbudujDate(+m[3], +m[2], +m[1]);
    m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
    if (m) return zbudujDate(+m[1], +m[2], +m[3]);
    var p = new Date(s);
    if (!isNaN(p.getTime())) return p;
  }
  return null;
}

function zbudujDate(rok, miesiac, dzien) {
  if (miesiac < 1 || miesiac > 12 || dzien < 1 || dzien > 31) return null;
  var d = new Date(rok, miesiac - 1, dzien, 12, 0, 0);
  if (d.getFullYear() !== rok || d.getMonth() !== miesiac - 1 || d.getDate() !== dzien) return null;
  return d;
}

function fmt(d) { return Utilities.formatDate(d, strefa(), "yyyy-MM-dd"); }

// Wartość do WPISANIA do komórki: dokładnie północ danego dnia w strefie ARKUSZA,
// więc w komórce nie ma żadnej godziny — ani widocznej, ani w pasku formuły.
// Zamiast liczyć przesunięcie stref, schodzimy godzina po godzinie i sprawdzamy,
// co arkusz naprawdę widzi. Odporne także na dni zmiany czasu.
function dataDoKomorki(iso) {
  if (!iso) return "";
  var s = String(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var pom = naDate(iso);
    if (!pom) return "";
    s = fmt(pom);
  }
  var d = new Date(s + "T12:00:00Z");
  for (var i = 0; i < 40; i++) {
    if (Utilities.formatDate(d, strefa(), "yyyy-MM-dd HH") === s + " 00") return d;
    d = new Date(d.getTime() - 3600000);
  }
  return new Date(s + "T12:00:00Z");   // ostateczność – nie powinna się zdarzyć
}

function maGodzine(v) {
  return (v instanceof Date) && (v.getHours() !== 0 || v.getMinutes() !== 0 || v.getSeconds() !== 0);
}

function opisWartosci(v) {
  if (v === "" || v === null || v === undefined) return "(puste)";
  return "„" + v + "” [" + (v instanceof Date ? "Date" : typeof v) + "]";
}

function literaKolumny(n) {
  var s = "";
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

function pasujeEmail(a, b) {
  if (!a || !b) return false;
  return a.toString().trim().toLowerCase() === b.toString().trim().toLowerCase();
}

function pokazBlad(txt) {
  try { SpreadsheetApp.getUi().alert("⚠️ " + txt); } catch (e) { Logger.log(txt); }
}

function zapiszRaportDo(nazwa, raport) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nazwa) || ss.insertSheet(nazwa);
  sh.clear();
  if (!raport.length) return;
  zapewnijPojemnosc(sh, raport.length + 1, 5);
  sh.getRange(1, 1, raport.length, 5).setValues(raport);
  sh.getRange(1, 1, 1, 5).setFontWeight("bold");
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 5);
}

function pobierzFolderIProjekt(file) {
  var parents = file.getParents();
  if (!parents.hasNext()) return { folder: null, projectName: "BRAK_FOLDERU" };
  var parentFolder = parents.next();
  var projectName  = parentFolder.getName();
  var main = parentFolder;
  if (projectName.indexOf("Notatki") !== -1 || projectName.indexOf("1.") !== -1) {
    var gp = parentFolder.getParents();
    if (gp.hasNext()) { main = gp.next(); projectName = main.getName(); }
  }
  return { folder: main, projectName: projectName };
}
