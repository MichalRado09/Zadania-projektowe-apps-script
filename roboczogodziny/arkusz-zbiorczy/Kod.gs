// ============================================================
// ROBOCZOGODZINY – ARKUSZ ZBIORCZY (skrypt administratora)
// ============================================================
//
// Co robi ten skrypt:
//   1. Z listy na karcie „Pracownicy” zakłada każdemu pracownikowi
//      INDYWIDUALNY arkusz „Roboczogodziny – e-mail” i udostępnia go tylko jemu.
//      Właścicielem plików jest osoba uruchamiająca skrypt (administrator).
//   2. Co 15 minut (automat):
//      • zamyka trwające sloty, których nikt nie zakończył – o godzinie końca
//        pracy pracownika albo przy osiągnięciu dziennego limitu (co wcześniej),
//      • zbiera sloty ze wszystkich arkuszy pracowników na kartę „Wszystkie sloty”,
//      • liczy sumy dzienne na karcie „Dni” i zgłasza problemy na karcie „RAPORT”
//        (np. nakładające się sloty wpisane ręcznie z pominięciem dodatku).
//
// Limit dzienny i godzinę końca pracy ustawia się TYLKO tutaj
// (kolumny C i D na karcie „Pracownicy”).
// W arkuszu pracownika karta „Ustawienia” jest chroniona – pracownik jej nie zmieni.
// ============================================================


// ============================================================
// KONFIGURACJA
// ============================================================
var CONFIG_ZB = {
  // Folder, do którego trafiają arkusze pracowników. Nie udostępniaj go
  // pracownikom – każdy dostaje dostęp wyłącznie do SWOJEGO pliku.
  // PUSTE = ten sam folder, w którym leży ten arkusz zbiorczy.
  ID_FOLDERU_ARKUSZY: '',

  // Początek nazwy pliku pracownika. MUSI być taki sam jak w dodatku.
  PREFIKS_NAZWY: 'Roboczogodziny – ',

  LIMIT_DOMYSLNY_H: 8,

  // Godzina końca pracy wpisywana, gdy kolumna „Koniec pracy” jest pusta.
  // Trwający slot, którego nikt nie zakończył, automat zamyka o tej godzinie
  // (albo wcześniej – przy osiągnięciu limitu).
  KONIEC_PRACY_DOMYSLNY: '16:00',
};

var ARK_PRACOWNICY = 'Pracownicy';
var ARK_WSZYSTKIE = 'Wszystkie sloty';
var ARK_DNI = 'Dni';
var ARK_RAPORT = 'RAPORT';

var P = { email: 1, imie: 2, limit: 3, koniec: 4, idPliku: 5, link: 6, stan: 7 };
var NAGLOWKI_PRACOWNIKOW = ['E-mail', 'Imię i nazwisko', 'Dzienny limit (h)', 'Koniec pracy (GG:MM)',
                            'ID pliku (system)', 'Link do arkusza (system)', 'Stan (system)'];


// ============================================================
// MENU
// ============================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('⏱ Roboczogodziny')
    .addItem('👥 Utwórz / zaktualizuj arkusze pracowników', 'przygotujArkusze')
    .addItem('🔄 Zbierz dane teraz', 'co15Minut')
    .addSeparator()
    .addItem('⏰ Włącz automat (co 15 minut)', 'wlaczAutomat')
    .addItem('⏹ Wyłącz automat', 'wylaczAutomat')
    .addToUi();
}

function toastZB_(tresc, tytul) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(tresc, tytul, 15); }
  catch (e) { Logger.log(tytul + ': ' + tresc); }
}

function alertZB_(tresc) {
  try { SpreadsheetApp.getUi().alert(tresc); } catch (e) { Logger.log(tresc); }
}


// ============================================================
// 1. ARKUSZE PRACOWNIKÓW
// ============================================================

function zapewnijPracownikow_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ARK_PRACOWNICY);
  if (!sh) {
    sh = ss.insertSheet(ARK_PRACOWNICY, 0);
    sh.getRange(1, 1, 1, NAGLOWKI_PRACOWNIKOW.length).setValues([NAGLOWKI_PRACOWNIKOW]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(P.email, 240);
    sh.setColumnWidth(P.imie, 200);
    sh.setColumnWidth(P.link, 280);
    sh.setColumnWidth(P.stan, 320);
    sh.getRange(2, P.koniec, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    sh.getRange(1, P.idPliku, 1, 3).setBackground('#e7e6e6');
  }
  return sh;
}

function przygotujArkusze() {
  var sh = zapewnijPracownikow_();
  var ostatni = sh.getLastRow();
  if (ostatni < 2) {
    alertZB_('Na karcie „' + ARK_PRACOWNICY + '” nie ma jeszcze pracowników.\n\n'
           + 'Wpisz od wiersza 2: e-mail, imię i nazwisko, dzienny limit w godzinach i godzinę końca pracy, '
           + 'a potem uruchom tę funkcję ponownie.');
    return;
  }

  var folder = folderArkuszy_();
  var zakres = sh.getRange(2, 1, ostatni - 1, NAGLOWKI_PRACOWNIKOW.length);
  var dane = zakres.getValues();
  var wys = zakres.getDisplayValues();
  var nowe = 0, zaktualizowane = 0, bledy = 0;

  for (var i = 0; i < dane.length; i++) {
    var wiersz = i + 2;
    var email = tekstRG_(dane[i][P.email - 1]).toLowerCase();
    if (!email) continue;

    try {
      if (email.indexOf('@') === -1) throw new Error('to nie wygląda na adres e-mail');

      var imie = tekstRG_(dane[i][P.imie - 1]);
      var limitH = limitWMinutach_(dane[i][P.limit - 1] || CONFIG_ZB.LIMIT_DOMYSLNY_H) / 60;
      var koniec = koniecPracy_(wys[i][P.koniec - 1]);
      var id = tekstRG_(dane[i][P.idPliku - 1]);
      var ss, plik;

      if (id) {
        ss = SpreadsheetApp.openById(id);
        plik = DriveApp.getFileById(id);
        zaktualizowane++;
      } else {
        ss = SpreadsheetApp.create(CONFIG_ZB.PREFIKS_NAZWY + email);
        plik = DriveApp.getFileById(ss.getId());
        plik.moveTo(folder);
        nowe++;
      }

      if (plik.getName() !== CONFIG_ZB.PREFIKS_NAZWY + email) plik.setName(CONFIG_ZB.PREFIKS_NAZWY + email);
      ss.setSpreadsheetTimeZone(STREFA_RG);
      przygotujPlikPracownika_(ss, email, imie, limitH, koniec);

      var edytorzy = plik.getEditors().map(function (u) { return String(u.getEmail()).toLowerCase(); });
      if (edytorzy.indexOf(email) === -1) plik.addEditor(email);

      sh.getRange(wiersz, P.email).setValue(email);
      if (!tekstRG_(dane[i][P.limit - 1])) sh.getRange(wiersz, P.limit).setValue(limitH);
      if (wys[i][P.koniec - 1] !== koniec) sh.getRange(wiersz, P.koniec).setNumberFormat('@').setValue(koniec);
      sh.getRange(wiersz, P.idPliku, 1, 3).setValues([[ss.getId(), ss.getUrl(),
        'OK – arkusz gotowy i udostępniony (' + Utilities.formatDate(new Date(), STREFA_RG, 'yyyy-MM-dd HH:mm') + ')']]);
    } catch (e) {
      bledy++;
      sh.getRange(wiersz, P.stan).setValue('BŁĄD: ' + e.message);
    }
  }

  alertZB_('Gotowe.\n\nNowe arkusze: ' + nowe + '\nZaktualizowane: ' + zaktualizowane
         + (bledy ? '\nBłędy: ' + bledy + ' – szczegóły w kolumnie „Stan”.' : ''));
}

/** Folder na arkusze pracowników: wskazany w konfiguracji albo folder, w którym leży ten arkusz. */
function folderArkuszy_() {
  if (CONFIG_ZB.ID_FOLDERU_ARKUSZY) return DriveApp.getFolderById(CONFIG_ZB.ID_FOLDERU_ARKUSZY);
  var rodzice = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
  if (!rodzice.hasNext()) throw new Error('Nie udało się ustalić folderu arkusza zbiorczego – wpisz ID_FOLDERU_ARKUSZY.');
  return rodzice.next();
}

/** Godzina końca pracy z listy → „GG:MM”; pusta albo nieczytelna → wartość domyślna. */
function koniecPracy_(v) {
  var m = minuty_(tekstRG_(v));
  return m === null ? CONFIG_ZB.KONIEC_PRACY_DOMYSLNY : hhmm_(m);
}

/** Układ arkusza pracownika: karta „Sloty” (edytowalna) i „Ustawienia” (chroniona). */
function przygotujPlikPracownika_(ss, email, imie, limitH, koniec) {

  // --- Sloty
  var sl = ss.getSheetByName(ARKUSZ_SLOTOW);
  if (!sl) {
    var arkusze = ss.getSheets();
    var pierwszy = arkusze[0];
    if (arkusze.length === 1 && pierwszy.getLastRow() === 0 && pierwszy.getName() !== ARKUSZ_USTAWIEN) {
      sl = pierwszy.setName(ARKUSZ_SLOTOW);
    } else {
      sl = ss.insertSheet(ARKUSZ_SLOTOW, 0);
    }
  }
  if (sl.getMaxColumns() < SL_ILE_KOLUMN) sl.insertColumnsAfter(sl.getMaxColumns(), SL_ILE_KOLUMN - sl.getMaxColumns());
  sl.getRange(1, 1, 1, SL_ILE_KOLUMN).setValues([NAGLOWKI_SLOTOW]).setFontWeight('bold').setBackground('#d9e2f3');
  sl.setFrozenRows(1);
  // Data i godziny jako zwykły tekst – inaczej Arkusz sam zamienia je na
  // daty/czasy w swojej strefie i potrafi przesunąć dzień.
  sl.getRange(2, SL.data, sl.getMaxRows() - 1, 3).setNumberFormat('@');
  sl.getRange(2, SL.czas, sl.getMaxRows() - 1, 1).setNumberFormat('0.00');
  sl.getRange(1, SL.komunikat).setBackground('#e7e6e6');
  sl.setColumnWidth(SL.nazwa, 220);
  sl.setColumnWidth(SL.zadanie, 260);
  sl.setColumnWidth(SL.komunikat, 260);

  // Łagodna ochrona: przy ręcznej edycji pojawi się ostrzeżenie „edytuj przez
  // dodatek”, ale edycja jest możliwa. Dodatku to nie blokuje.
  if (sl.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
    sl.protect().setDescription('Sloty – najlepiej edytuj przez dodatek „Roboczogodziny”').setWarningOnly(true);
  }

  // --- Ustawienia
  var us = ss.getSheetByName(ARKUSZ_USTAWIEN) || ss.insertSheet(ARKUSZ_USTAWIEN);
  us.getRange(4, 2).setNumberFormat('@');
  us.getRange(1, 1, 5, 2).setValues([
    ['Pracownik (e-mail)', email],
    ['Imię i nazwisko', imie],
    ['Dzienny limit (h)', limitH],
    ['Koniec pracy', koniec],
    ['Uwaga', 'Te wartości ustawia administrator w arkuszu zbiorczym. Nie da się ich zmienić tutaj.'],
  ]);
  us.getRange(1, 1, 5, 1).setFontWeight('bold');
  us.setColumnWidth(1, 180);
  us.setColumnWidth(2, 420);

  var ochrony = us.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var ochrona = ochrony.length ? ochrony[0] : us.protect();
  ochrona.setDescription('Ustawienia – tylko administrator').setWarningOnly(false);
  ochrona.addEditor(Session.getEffectiveUser());
  ochrona.removeEditors(ochrona.getEditors());
  if (ochrona.canDomainEdit()) ochrona.setDomainEdit(false);
}


// ============================================================
// 2. AUTOMAT – DOMYKANIE LIMITÓW I ZBIERANIE DANYCH
// ============================================================

function wlaczAutomat() {
  wylaczAutomat(true);
  ScriptApp.newTrigger('co15Minut').timeBased().everyMinutes(15).create();
  alertZB_('Automat włączony – dane będą zbierane co 15 minut.');
}

function wylaczAutomat(cicho) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'co15Minut') ScriptApp.deleteTrigger(t);
  });
  if (cicho !== true) alertZB_('Automat wyłączony.');
}

function co15Minut() {
  var blokada = LockService.getScriptLock();
  if (!blokada.tryLock(30000)) { Logger.log('Poprzedni przebieg jeszcze trwa – pomijam.'); return; }

  try {
    var sh = zapewnijPracownikow_();
    var ostatni = sh.getLastRow();
    var teraz = teraz_();
    var wynik = { wszystkie: [], dni: [], raport: [], zamkniete: 0 };

    if (ostatni >= 2) {
      var zakresListy = sh.getRange(2, 1, ostatni - 1, NAGLOWKI_PRACOWNIKOW.length);
      var lista = zakresListy.getValues();
      var listaWys = zakresListy.getDisplayValues();
      for (var i = 0; i < lista.length; i++) {
        var email = tekstRG_(lista[i][P.email - 1]).toLowerCase();
        var id = tekstRG_(lista[i][P.idPliku - 1]);
        if (!email) continue;
        if (!id) {
          wynik.raport.push([email, '-', 'BRAK ARKUSZA', 'Uruchom „👥 Utwórz / zaktualizuj arkusze pracowników”.']);
          continue;
        }
        try {
          przetworzPracownika_(email, tekstRG_(lista[i][P.imie - 1]),
            limitWMinutach_(lista[i][P.limit - 1] || CONFIG_ZB.LIMIT_DOMYSLNY_H),
            koniecPracy_(listaWys[i][P.koniec - 1]), id, teraz, wynik);
        } catch (e) {
          wynik.raport.push([email, '-', 'BŁĄD ODCZYTU', e.message]);
        }
      }
    }

    zapiszZbiorcze_(wynik, teraz);
    toastZB_('Pracowników: ' + Math.max(0, ostatni - 1) + ' | slotów: ' + wynik.wszystkie.length
           + ' | zamknięte automatycznie: ' + wynik.zamkniete + ' | problemy: ' + wynik.raport.length,
             'Roboczogodziny – zebrano');
  } finally {
    blokada.releaseLock();
  }
}

function przetworzPracownika_(email, imie, limitMin, koniec, id, teraz, wynik) {
  var ss = SpreadsheetApp.openById(id);
  var strefa = ss.getSpreadsheetTimeZone();
  var sl = ss.getSheetByName(ARKUSZ_SLOTOW);
  if (!sl) throw new Error('w arkuszu nie ma karty „' + ARKUSZ_SLOTOW + '”');

  // Limit mógł zostać zmieniony na liście pracowników – przenosimy go do pliku,
  // bo stamtąd czyta go dodatek.
  var us = ss.getSheetByName(ARKUSZ_USTAWIEN);
  if (us && limitWMinutach_(us.getRange(3, 2).getValue()) !== limitMin) us.getRange(3, 2).setValue(limitMin / 60);
  if (us && us.getRange(4, 2).getDisplayValue() !== koniec) us.getRange(4, 2).setNumberFormat('@').setValue(koniec);
  var koniecMin = minuty_(koniec);

  var ostatni = sl.getLastRow();
  var sloty = [];
  if (ostatni >= 2) {
    var zakres = sl.getRange(2, 1, ostatni - 1, SL_ILE_KOLUMN);
    var dane = zakres.getValues();
    var wys = zakres.getDisplayValues();
    for (var i = 0; i < dane.length; i++) {
      var s = slotZWiersza_(dane[i], i + 2, strefa, wys[i]);
      if (!s) continue;
      if (s.blad) wynik.raport.push([email, 'wiersz ' + s.wiersz, 'NIECZYTELNY SLOT', s.blad]);
      sloty.push(s);
    }
  }

  // --- domykanie trwających slotów
  var otwarte = sloty.filter(function (s) { return !s.blad && s.do === null; });
  if (otwarte.length > 1) {
    wynik.raport.push([email, '-', 'KILKA TRWAJĄCYCH SLOTÓW',
      otwarte.map(function (s) { return s.data + ' ' + hhmm_(s.od); }).join(', ') + ' – powinien trwać najwyżej jeden.']);
  }
  otwarte.forEach(function (s) {
    var d = domknijWgLimitu_(s, sloty, limitMin, teraz, koniecMin);
    if (!d) return;
    s.do = d.do; s.status = d.status; s.komunikat = d.komunikat;
    sl.getRange(s.wiersz, 1, 1, SL_ILE_KOLUMN).setValues([wierszZeSlotu_(s)]);
    wynik.zamkniete++;
    wynik.raport.push([email, s.data, 'ZAMKNIĘTO AUTOMATYCZNIE', d.komunikat]);
  });

  // --- kolizje i sumy dzienne
  var poprawne = sloty.filter(function (s) { return !s.blad; });
  var dni = {};
  poprawne.forEach(function (s) { (dni[s.data] = dni[s.data] || []).push(s); });

  var kolizje = {};
  Object.keys(dni).forEach(function (d) {
    var zDnia = dni[d];
    for (var a = 0; a < zDnia.length; a++) {
      for (var b = a + 1; b < zDnia.length; b++) {
        if (nakladaSie_(zDnia[a], zDnia[b], teraz)) {
          kolizje[zDnia[a].id] = kolizje[zDnia[b].id] = true;
          kolizje['dzien:' + d] = true;
          wynik.raport.push([email, d, 'NAKŁADAJĄCE SIĘ SLOTY',
            hhmm_(zDnia[a].od) + '–' + hhmm_(koniecEfektywny_(zDnia[a], teraz)) + ' (' + opisSlotu_(zDnia[a]) + ') i '
            + hhmm_(zDnia[b].od) + '–' + hhmm_(koniecEfektywny_(zDnia[b], teraz)) + ' (' + opisSlotu_(zDnia[b]) + ')']);
        }
      }
    }
    var suma = sumaDnia_(zDnia, d, teraz, null);
    var uwagi = [];
    if (suma > limitMin) {
      uwagi.push('PRZEKROCZONY LIMIT');
      wynik.raport.push([email, d, 'PRZEKROCZONY LIMIT', czasTekst_(suma) + ' przy limicie ' + czasTekst_(limitMin)]);
    }
    if (kolizje['dzien:' + d]) uwagi.push('NAKŁADAJĄCE SIĘ SLOTY');
    if (zDnia.some(function (s) { return s.do === null; })) uwagi.push('slot trwa');
    wynik.dni.push([email, imie, d, Math.round(suma / 60 * 100) / 100, limitMin / 60, uwagi.join(', ')]);
  });

  sloty.forEach(function (s) {
    wynik.wszystkie.push([email, imie, s.data, hhmm_(s.od), s.do === null ? '' : hhmm_(s.do),
      (s.blad || s.do === null) ? '' : Math.round((s.do - s.od) / 60 * 100) / 100,
      s.kod, s.nazwa, s.zadanie, s.idZadania, s.status || (s.do === null ? ST_TRWA : ST_ZAKONCZONY), s.id,
      s.blad ? 'NIECZYTELNY: ' + s.blad : (kolizje[s.id] ? 'NAKŁADA SIĘ Z INNYM SLOTEM' : '')]);
  });
}

function zapiszZbiorcze_(wynik, teraz) {
  var sortuj = function (a, b) {
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : (a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0));
  };
  wynik.wszystkie.sort(sortuj);
  wynik.dni.sort(sortuj);

  zapiszKarte_(ARK_WSZYSTKIE,
    ['E-mail', 'Pracownik', 'Data', 'Od', 'Do', 'Czas (h)', 'Kod projektu', 'Nazwa projektu',
     'Zadanie', 'ID zadania', 'Status', 'ID slotu', 'Uwagi'], wynik.wszystkie);
  zapiszKarte_(ARK_DNI, ['E-mail', 'Pracownik', 'Data', 'Suma (h)', 'Limit (h)', 'Uwagi'], wynik.dni);

  var raport = wynik.raport.length ? wynik.raport : [['-', '-', 'BRAK PROBLEMÓW', '']];
  zapiszKarte_(ARK_RAPORT, ['E-mail', 'Dzień / wiersz', 'Problem', 'Szczegóły'],
    [['Przebieg', hhmm_(teraz.min) + ' ' + teraz.data, '', '']].concat(raport));
}

function zapiszKarte_(nazwa, naglowki, wiersze) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nazwa) || ss.insertSheet(nazwa);
  sh.clearContents();
  sh.getRange(1, 1, 1, naglowki.length).setValues([naglowki]).setFontWeight('bold');
  sh.setFrozenRows(1);
  if (wiersze.length) {
    if (sh.getMaxRows() < wiersze.length + 1) sh.insertRowsAfter(sh.getMaxRows(), wiersze.length + 1 - sh.getMaxRows());
    sh.getRange(2, 1, wiersze.length, naglowki.length).setValues(wiersze);
  }
}


// ============================================================
// LOGIKA SLOTÓW – wspólna dla dodatku i arkusza zbiorczego
// (ten sam fragment jest w obu skryptach – zmieniając, zmień w obu)
// ============================================================
//
// Slot w pamięci:
//   { id, data: 'RRRR-MM-DD', od: minuty od północy, do: minuty albo null (trwa),
//     kod, nazwa, zadanie, idZadania, status, komunikat, wiersz }
//
// Godziny trzymamy jako MINUTY OD PÓŁNOCY czasu polskiego, a datę jako tekst.
// Dzięki temu nie ma żadnych przesunięć stref czasowych, które przy datach
// w arkuszach potrafiły przestawiać dzień.

var STREFA_RG = 'Europe/Warsaw';

var ARKUSZ_SLOTOW = 'Sloty';
var ARKUSZ_USTAWIEN = 'Ustawienia';

var SL = { id: 1, data: 2, od: 3, do: 4, czas: 5, kod: 6, nazwa: 7, zadanie: 8,
           idZadania: 9, status: 10, zmiana: 11, komunikat: 12 };
var SL_ILE_KOLUMN = 12;
var NAGLOWKI_SLOTOW = ['ID slotu', 'Data', 'Od', 'Do', 'Czas (h)', 'Kod projektu', 'Nazwa projektu',
                       'Zadanie', 'ID zadania', 'Status', 'Ostatnia zmiana', 'Komunikat (system)'];

var ST_TRWA = 'Trwa';
var ST_ZAKONCZONY = 'Zakończony';
var ST_LIMIT = 'Zamknięty – limit';
var ST_KONIEC_PRACY = 'Zamknięty – koniec pracy';
var ST_KONIEC_DNIA = 'Zamknięty – koniec dnia';

// Ostatnia minuta doby – slot nie może przechodzić przez północ.
var KONIEC_DOBY = 23 * 60 + 59;

/** Bieżący moment: data i minuta czasu polskiego (sekundy obcięte). */
function teraz_() {
  var t = Utilities.formatDate(new Date(), STREFA_RG, 'yyyy-MM-dd HH:mm').split(' ');
  return { data: t[0], min: minuty_(t[1]) };
}

/** Godzina z komórki → minuty od północy albo null. Przyjmuje tekst „9:05”/„09:05”, Date i ułamek doby. */
function minuty_(v, strefa) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return minuty_(Utilities.formatDate(v, strefa || STREFA_RG, 'HH:mm'));
  }
  if (typeof v === 'number') {
    if (v < 0 || v >= 1) return null;
    return Math.round(v * 1440) % 1440;
  }
  var m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (!m) return null;
  var h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function hhmm_(min) {
  if (min === null || min === undefined) return '';
  var h = Math.floor(min / 60), m = min % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}

/** Data z komórki → „RRRR-MM-DD” albo ''. */
function dzien_(v, strefa) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, strefa || STREFA_RG, 'yyyy-MM-dd');
  var s = String(v).trim();
  var dwa = function (x) { return ('0' + x).slice(-2); };
  var m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/);
  if (m) return m[1] + '-' + dwa(m[2]) + '-' + dwa(m[3]);
  m = s.match(/^(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})$/);
  if (m) return m[3] + '-' + dwa(m[2]) + '-' + dwa(m[1]);
  return '';
}

function tekstRG_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

/**
 * Wiersz arkusza „Sloty” → slot; null dla pustego wiersza; slot z polem „blad”, gdy nie da się go odczytać.
 * @param wys  ten sam wiersz jako WYŚWIETLANY tekst (getDisplayValues). Godziny czytamy z niego,
 *             bo godzina zamieniona przez Arkusz na „czas” wraca do skryptu jako data z 1899 r.
 *             i potrafi przesunąć się o kilkadziesiąt minut (historyczna strefa czasowa).
 */
function slotZWiersza_(r, wiersz, strefa, wys) {
  wys = wys || r;
  var id = tekstRG_(r[SL.id - 1]);
  var surowaData = r[SL.data - 1];
  if (!id && (surowaData === '' || surowaData === null)) return null;

  var s = {
    wiersz: wiersz,
    id: id,
    data: dzien_(surowaData, strefa),
    od: minuty_(wys[SL.od - 1], strefa),
    do: minuty_(wys[SL.do - 1], strefa),
    kod: tekstRG_(r[SL.kod - 1]),
    nazwa: tekstRG_(r[SL.nazwa - 1]),
    zadanie: tekstRG_(r[SL.zadanie - 1]),
    idZadania: tekstRG_(r[SL.idZadania - 1]),
    status: tekstRG_(r[SL.status - 1]),
    komunikat: tekstRG_(r[SL.komunikat - 1]),
  };

  if (!s.data) s.blad = 'nieczytelna data „' + tekstRG_(surowaData) + '”';
  else if (s.od === null) s.blad = 'nieczytelna godzina „Od” „' + tekstRG_(wys[SL.od - 1]) + '”';
  else if (s.do === null && tekstRG_(wys[SL.do - 1]) !== '') s.blad = 'nieczytelna godzina „Do” „' + tekstRG_(wys[SL.do - 1]) + '”';
  return s;
}

/** Slot → wartości kolumn A–L do zapisania w arkuszu (godziny i data jako tekst). */
function wierszZeSlotu_(s) {
  var r = [];
  for (var i = 0; i < SL_ILE_KOLUMN; i++) r.push('');
  r[SL.id - 1] = s.id;
  r[SL.data - 1] = s.data;
  r[SL.od - 1] = hhmm_(s.od);
  r[SL.do - 1] = s.do === null ? '' : hhmm_(s.do);
  r[SL.czas - 1] = s.do === null ? '' : Math.round((s.do - s.od) / 60 * 100) / 100;
  r[SL.kod - 1] = s.kod || '';
  r[SL.nazwa - 1] = s.nazwa || '';
  r[SL.zadanie - 1] = s.zadanie || '';
  r[SL.idZadania - 1] = s.idZadania || '';
  r[SL.status - 1] = s.status || (s.do === null ? ST_TRWA : ST_ZAKONCZONY);
  r[SL.zmiana - 1] = Utilities.formatDate(new Date(), STREFA_RG, 'yyyy-MM-dd HH:mm');
  r[SL.komunikat - 1] = s.komunikat || '';
  return r;
}

/**
 * Koniec slotu do liczenia czasu i kolizji. Trwający slot „kończy się teraz”
 * (a jeśli został z wcześniejszego dnia – o północy).
 */
function koniecEfektywny_(s, teraz) {
  if (s.do !== null && s.do !== undefined) return s.do;
  if (s.data === teraz.data) return Math.max(teraz.min, s.od);
  if (s.data < teraz.data) return KONIEC_DOBY;
  return s.od;
}

function nakladaSie_(a, b, teraz) {
  if (a.data !== b.data) return false;
  var poczatek = Math.max(a.od, b.od);
  var koniec = Math.min(koniecEfektywny_(a, teraz), koniecEfektywny_(b, teraz));
  return poczatek < koniec;
}

/** Pierwszy INNY slot, z którym ten się nakłada, albo null. */
function kolizja_(slot, sloty, teraz) {
  for (var i = 0; i < sloty.length; i++) {
    var inny = sloty[i];
    if (inny.blad || (slot.id && inny.id === slot.id)) continue;
    if (nakladaSie_(slot, inny, teraz)) return inny;
  }
  return null;
}

/** Suma minut w danym dniu (trwający slot liczony do teraz). */
function sumaDnia_(sloty, data, teraz, pominId) {
  var suma = 0;
  for (var i = 0; i < sloty.length; i++) {
    var s = sloty[i];
    if (s.blad || s.data !== data || (pominId && s.id === pominId)) continue;
    suma += Math.max(0, koniecEfektywny_(s, teraz) - s.od);
  }
  return suma;
}

function czasTekst_(min) {
  min = Math.max(0, Math.round(min));
  var h = Math.floor(min / 60), m = min % 60;
  if (!h) return m + ' min';
  return h + ' h' + (m ? ' ' + (m < 10 ? '0' : '') + m + ' min' : '');
}

function opisSlotu_(s) {
  return (s.kod || '(bez projektu)') + (s.zadanie ? ' – ' + s.zadanie : '');
}

/**
 * Sprawdza nowy lub zmieniony slot na tle pozostałych slotów pracownika.
 * Zwraca treść błędu albo null, gdy wszystko jest w porządku.
 */
function sprawdzSlot_(slot, sloty, limitMin, teraz) {
  if (!slot.data) return 'Wybierz datę.';
  if (slot.od === null || slot.od === undefined) return 'Podaj godzinę rozpoczęcia.';

  var trwa = (slot.do === null || slot.do === undefined);

  if (!trwa && slot.do <= slot.od) {
    return 'Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia. '
         + 'Slot nie może przechodzić przez północ – w takim wypadku podziel go na dwa.';
  }
  if (slot.data > teraz.data || (slot.data === teraz.data && (trwa ? slot.od : slot.do) > teraz.min)) {
    return 'Nie można wpisać pracy w przyszłości (teraz jest ' + hhmm_(teraz.min) + ').';
  }
  if (trwa && slot.data !== teraz.data) {
    return 'Trwać może tylko dzisiejszy slot – podaj godzinę zakończenia.';
  }

  var inny = kolizja_(slot, sloty, teraz);
  if (inny) {
    return 'Ten slot nakłada się na inny: ' + hhmm_(inny.od) + '–'
         + (inny.do === null ? 'trwa' : hhmm_(inny.do)) + ' (' + opisSlotu_(inny) + '). Popraw godziny.';
  }

  var suma = sumaDnia_(sloty, slot.data, teraz, slot.id) + (koniecEfektywny_(slot, teraz) - slot.od);
  if (suma > limitMin) {
    return 'Przekroczony dzienny limit: w tym dniu byłoby ' + czasTekst_(suma)
         + ', a limit to ' + czasTekst_(limitMin) + '.';
  }
  return null;
}

/**
 * Godzina, o której trwający slot zamknie się sam: osiągnięcie limitu dziennego
 * albo stała godzina końca pracy – co nastąpi wcześniej. Koniec pracy nie
 * dotyczy slotu rozpoczętego o tej godzinie lub później (świadome nadgodziny) –
 * wtedy obowiązuje tylko limit.
 * Zwraca { min, status } albo null, gdy slot jest zakończony.
 */
function planowaneZamkniecie_(otwarty, sloty, limitMin, teraz, koniecPracy) {
  if (!otwarty || otwarty.blad || otwarty.do !== null) return null;
  var pozostale = sloty.filter(function (s) { return s.id !== otwarty.id; });
  var wolne = Math.max(0, limitMin - sumaDnia_(pozostale, otwarty.data, teraz, null));
  var wynik = { min: otwarty.od + wolne, status: ST_LIMIT };
  if (koniecPracy !== null && koniecPracy !== undefined && koniecPracy > otwarty.od && koniecPracy <= wynik.min) {
    wynik = { min: koniecPracy, status: ST_KONIEC_PRACY };
  }
  if (wynik.min > KONIEC_DOBY) wynik = { min: KONIEC_DOBY, status: ST_KONIEC_DNIA };
  return wynik;
}

/**
 * Czy trwający slot trzeba zamknąć automatycznie – bo minął koniec pracy,
 * osiągnięto limit dzienny albo slot został otwarty poprzedniego dnia.
 * Zwraca null (nic nie robić) albo { do, status, komunikat }.
 */
function domknijWgLimitu_(otwarty, sloty, limitMin, teraz, koniecPracy) {
  var plan = planowaneZamkniecie_(otwarty, sloty, limitMin, teraz, koniecPracy);
  if (!plan) return null;
  var zDzisiaj = otwarty.data === teraz.data;
  if (zDzisiaj && teraz.min < plan.min) return null;
  if (otwarty.data > teraz.data) return null;

  var powod;
  if (plan.status === ST_LIMIT) powod = 'osiągnięto dzienny limit ' + czasTekst_(limitMin);
  else if (plan.status === ST_KONIEC_PRACY) powod = 'koniec pracy o ' + hhmm_(koniecPracy);
  else powod = 'koniec doby';

  return {
    do: plan.min, status: plan.status,
    komunikat: 'Slot ' + (zDzisiaj ? '' : 'z ' + otwarty.data + ' ') + 'nie został zakończony – zamknięto go automatycznie o '
             + hhmm_(plan.min) + ' (' + powod + ').'
             + (plan.status === ST_LIMIT ? '' : ' Jeśli pracowałeś dłużej, popraw godzinę w „Moich slotach”.')
  };
}

/** Najpóźniejszy koniec zakończonego slotu w danym dniu, nie późniejszy niż „przed”. */
function koniecPoprzedniego_(sloty, data, przed, pominId) {
  var wynik = null;
  for (var i = 0; i < sloty.length; i++) {
    var s = sloty[i];
    if (s.blad || s.data !== data || s.do === null || (pominId && s.id === pominId)) continue;
    if (s.do <= przed && (wynik === null || s.do > wynik)) wynik = s.do;
  }
  return wynik;
}

function nowyIdSlotu_() {
  return 'SLOT-' + Utilities.getUuid().split('-')[0].toUpperCase();
}

/** Limit z arkusza w godzinach (np. 8 albo „7,5”) → minuty; domyślnie 8 h. */
function limitWMinutach_(v) {
  var n = Number(String(v === null || v === undefined ? '' : v).replace(',', '.'));
  if (!n || n <= 0 || n > 24) n = 8;
  return Math.round(n * 60);
}
