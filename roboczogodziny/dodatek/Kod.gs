// ============================================================
// DODATEK „ROBOCZOGODZINY” – panel boczny Kalendarza Google
// ============================================================
//
// Co widzi pracownik po otwarciu panelu:
//   • na górze – trwającą pracę (projekt, zadanie, od kiedy) z przyciskiem „⏹ Zakończ”,
//   • przyciski „▶ Rozpocznij pracę”, „➕ Dodaj slot ręcznie”, „📋 Moje sloty”,
//   • listę dzisiejszych slotów i sumę dnia względem limitu.
//
// Gdzie trafiają dane:
//   Do INDYWIDUALNEGO arkusza pracownika „Roboczogodziny – e-mail”, który
//   zakłada administrator w arkuszu zbiorczym. Każdy widzi i edytuje tylko
//   swój plik. Arkusz zbiorczy co 15 minut zbiera dane ze wszystkich plików
//   i domyka niezakończone sloty (koniec pracy albo dzienny limit).
//
// Zasady pilnowane przy każdym zapisie:
//   • sloty jednego pracownika nie mogą się nakładać,
//   • suma dnia nie może przekroczyć limitu (ustawia go administrator),
//   • slot mieści się w jednym dniu i nie może kończyć się w przyszłości,
//   • „Rozpocznij” przy trwającym slocie najpierw go kończy (ta sama minuta),
//   • nowy slot można zacząć od godziny końca poprzedniego (tego samego dnia).
// ============================================================


// ============================================================
// KONFIGURACJA
// ============================================================

const CONFIG = {

  // ⬇ Arkusz-słownik z listą kodów i nazw projektów (ten sam, co w dodatku „Zadanie projektowe”).
  ID_ARKUSZA: 'TU_WKLEJ_ID_ARKUSZA_SLOWNIKA',

  // ⬇ Folder z projektami – ten sam, który skanuje baza główna. Szukamy w nim
  //   list zadań „#KOD …”, np. „#PRJ001 Zadania – …” (zadanie przy slocie jest opcjonalne).
  ID_FOLDERU_PROJEKTOW: 'TU_WKLEJ_ID_FOLDERU_PROJEKTOW',
  ZNACZNIK_PLIKU: '#',

  // Początek nazwy arkusza pracownika. MUSI być taki sam jak w arkuszu zbiorczym.
  PREFIKS_NAZWY: 'Roboczogodziny – ',

  // ⬇ E-mail administratora – właściciela arkuszy pracowników. Gdy wpisany,
  // dodatek użyje tylko pliku, którego właścicielem jest ta osoba – pracownik
  // nie podmieni sobie arkusza na własną kopię z innym limitem. Puste = bez sprawdzania.
  WLASCICIEL_PLIKOW: '',

  // Gdy przerwa od końca poprzedniego slotu jest nie dłuższa niż tyle minut,
  // przy „Rozpocznij” domyślnie zaznaczamy „od końca poprzedniego”.
  PRZERWA_DO_DOMKNIECIA_MIN: 15,

  // Ile dni ze slotami pokazywać na jednej stronie „Moich slotów”.
  DNI_NA_STRONIE: 7,

  // Zakładki słownika – PRZYKŁADOWA konfiguracja, dostosuj do własnego arkusza
  // (taka sama jak w dodatku „Zadanie projektowe”):
  //   wierszDanych – pierwszy wiersz z danymi, kol* – numery kolumn,
  //   dozwolone – wartości kolumny filtra, które mają trafić na listę (pusto = wszystkie).
  ZAKLADKI: [
    { nazwa: 'OFERTY',   wierszDanych: 3, kolKod: 1, kolNazwa: 2, kolFiltr: 4, dozwolone: ['otwarta'], grupa: 'Oferta' },
    { nazwa: 'PROJEKTY', wierszDanych: 4, kolKod: 1, kolNazwa: 2, kolFiltr: 3, dozwolone: ['aktywny'], grupa: 'Projekt' },
  ],
  ODWROC_KOLEJNOSC: true,
  POKAZ_LISTE: true,
  MAX_WYNIKOW: 40,
  CZAS_CACHE: 21600,
  CZAS_CACHE_PLIKOW: 600,
};

const KLUCZ_CACHE = 'rg_projekty_v1';
const KLUCZ_CACHE_PLIKOW = 'rg_listy_zadan_v1';
const KLUCZ_PLIKU_PRACOWNIKA = 'rg_moj_plik_v1';

// Układ listy zadań projektu (tylko do odczytu).
const KOL_ZADAN = { temat: 1, status: 6, idSystemowe: 8 };
const NAGLOWEK_KARTY_ZADAN = 'temat';

const DNI_TYGODNIA = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

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


// ============================================================
// 1. KONTEKST – arkusz pracownika i jego sloty
// ============================================================

function mojEmail_() {
  try { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }
  catch (e) { return ''; }
}

/** Arkusz pracownika. Rzuca wyjątkiem z czytelnym komunikatem, gdy go nie ma. */
function plikPracownika_(email) {
  const cache = CacheService.getUserCache();
  const zapamietany = cache.get(KLUCZ_PLIKU_PRACOWNIKA);
  if (zapamietany) {
    try { return SpreadsheetApp.openById(zapamietany); } catch (e) { cache.remove(KLUCZ_PLIKU_PRACOWNIKA); }
  }

  const nazwa = CONFIG.PREFIKS_NAZWY + email;
  const pliki = DriveApp.searchFiles("title = '" + nazwa.replace(/'/g, "\\'") + "' and trashed = false "
                                   + "and mimeType = 'application/vnd.google-apps.spreadsheet'");
  while (pliki.hasNext()) {
    const f = pliki.next();
    if (CONFIG.WLASCICIEL_PLIKOW) {
      const wl = f.getOwner();
      if (!wl || String(wl.getEmail()).toLowerCase() !== CONFIG.WLASCICIEL_PLIKOW.toLowerCase()) continue;
    }
    const ss = SpreadsheetApp.openById(f.getId());
    const us = ss.getSheetByName(ARKUSZ_USTAWIEN);
    if (!us || tekstRG_(us.getRange(1, 2).getValue()).toLowerCase() !== email) continue;
    cache.put(KLUCZ_PLIKU_PRACOWNIKA, f.getId(), 21600);
    return ss;
  }
  throw new Error('BRAK_PLIKU');
}

/** Wszystko, czego potrzebuje karta: plik, sloty, limit, bieżący moment. */
function kontekst_() {
  const email = mojEmail_();
  if (!email) throw new Error('Nie udało się odczytać Twojego adresu e-mail.');

  const ss = plikPracownika_(email);
  const sh = ss.getSheetByName(ARKUSZ_SLOTOW);
  if (!sh) throw new Error('W Twoim arkuszu roboczogodzin nie ma karty „' + ARKUSZ_SLOTOW + '”. Zgłoś to administratorowi.');
  const us = ss.getSheetByName(ARKUSZ_USTAWIEN);
  const strefa = ss.getSpreadsheetTimeZone();

  const ostatni = sh.getLastRow();
  const sloty = [];
  if (ostatni >= 2) {
    const zakres = sh.getRange(2, 1, ostatni - 1, SL_ILE_KOLUMN);
    const dane = zakres.getValues();
    const wys = zakres.getDisplayValues();
    for (let i = 0; i < dane.length; i++) {
      const s = slotZWiersza_(dane[i], i + 2, strefa, wys[i]);
      if (s) sloty.push(s);
    }
  }

  return {
    email: email, ss: ss, sh: sh, url: ss.getUrl(), sloty: sloty, teraz: teraz_(),
    limit: limitWMinutach_(us ? us.getRange(3, 2).getValue() : 8),
    koniecPracy: us ? minuty_(us.getRange(4, 2).getDisplayValue()) : null,
  };
}

function trwajacy_(ctx) {
  return ctx.sloty.filter(function (s) { return !s.blad && s.do === null; })[0] || null;
}

function slotPoId_(ctx, id) {
  const trafione = ctx.sloty.filter(function (s) { return s.id && s.id === id; });
  if (trafione.length === 0) throw new Error('Nie znaleziono slotu ' + id + ' – mógł zostać usunięty.');
  if (trafione.length > 1) throw new Error('Identyfikator ' + id + ' występuje w kilku wierszach – popraw to w arkuszu.');
  return trafione[0];
}

function zapiszWiersz_(ctx, s) {
  ctx.sh.getRange(s.wiersz, 1, 1, SL_ILE_KOLUMN).setValues([wierszZeSlotu_(s)]);
}

function dopiszWiersz_(ctx, s) {
  s.wiersz = Math.max(ctx.sh.getLastRow(), 1) + 1;
  if (s.wiersz > ctx.sh.getMaxRows()) ctx.sh.insertRowsAfter(ctx.sh.getMaxRows(), s.wiersz - ctx.sh.getMaxRows());
  ctx.sh.getRange(s.wiersz, SL.data, 1, 3).setNumberFormat('@');
  zapiszWiersz_(ctx, s);
  ctx.sloty.push(s);
}

/**
 * Domyka trwający slot, jeśli przekroczył limit albo został z poprzedniego dnia.
 * To samo robi automat w arkuszu zbiorczym – tutaj dzieje się to od razu przy
 * otwarciu panelu, żeby pracownik nie widział „trwa” ponad limit.
 */
function domknijTrwajacy_(ctx) {
  const t = trwajacy_(ctx);
  if (!t) return;
  const d = domknijWgLimitu_(t, ctx.sloty, ctx.limit, ctx.teraz, ctx.koniecPracy);
  if (!d) return;
  t.do = d.do; t.status = d.status; t.komunikat = d.komunikat;
  zapiszWiersz_(ctx, t);
}

/** Zbiera komunikaty zostawione przez automat i czyści je, żeby pokazały się tylko raz. */
function odbierzKomunikaty_(ctx) {
  const komunikaty = [];
  ctx.sloty.forEach(function (s) {
    if (!s.komunikat) return;
    komunikaty.push(s.komunikat);
    s.komunikat = '';
    ctx.sh.getRange(s.wiersz, SL.komunikat).setValue('');
  });
  return komunikaty;
}

function zBlokada_(fn) {
  const blokada = LockService.getUserLock();
  blokada.waitLock(20000);
  try { return fn(); }
  finally { blokada.releaseLock(); }
}


// ============================================================
// 2. KARTA GŁÓWNA
// ============================================================

function onHomepage(e) {
  return kartaGlownaBezpieczna_([]);
}

function kartaGlownaBezpieczna_(dodatkowe) {
  try {
    return zBlokada_(function () { return kartaGlowna_(dodatkowe); });
  } catch (err) {
    if (err.message === 'BRAK_PLIKU') return kartaBrakuPliku_();
    console.error(err.stack || err.message);
    return kartaBledu_('Wystąpił błąd: ' + err.message);
  }
}

function kartaGlowna_(dodatkowe) {
  const ctx = kontekst_();
  domknijTrwajacy_(ctx);
  const komunikaty = (dodatkowe || []).concat(odbierzKomunikaty_(ctx));

  const dzis = ctx.teraz.data;
  const suma = sumaDnia_(ctx.sloty, dzis, ctx.teraz, null);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Roboczogodziny')
      .setSubtitle('Dziś: ' + czasTekst_(suma) + ' z ' + czasTekst_(ctx.limit)));

  if (komunikaty.length) {
    const sk = CardService.newCardSection();
    komunikaty.forEach(function (k) {
      sk.addWidget(CardService.newTextParagraph().setText('<font color="#d93025"><b>' + escapeHtml_(k) + '</b></font>'));
    });
    karta.addSection(sk);
  }

  const t = trwajacy_(ctx);
  if (t) {
    const wolne = Math.max(0, ctx.limit - suma);
    const plan = planowaneZamkniecie_(t, ctx.sloty, ctx.limit, ctx.teraz, ctx.koniecPracy);
    const kiedy = plan.status === ST_KONIEC_PRACY
      ? 'o ' + hhmm_(plan.min) + ' (koniec pracy) slot zamknie się sam, jeśli wcześniej nie klikniesz „Zakończ”'
      : 'po nim slot zamknie się sam (o ' + hhmm_(plan.min) + ')';
    karta.addSection(CardService.newCardSection()
      .setHeader('▶ Trwa praca')
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('od ' + hhmm_(t.od) + ' · ' + czasTekst_(koniecEfektywny_(t, ctx.teraz) - t.od))
        .setText('<b>' + escapeHtml_(t.kod) + '</b>' + (t.nazwa ? ' – ' + escapeHtml_(t.nazwa) : ''))
        .setBottomLabel(t.zadanie || 'bez zadania')
        .setWrapText(true))
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#5f6368">Do limitu zostało ' + czasTekst_(wolne) + '; ' + kiedy + '.</font>'))
      .addWidget(CardService.newTextButton()
        .setText('⏹ Zakończ')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(akcja_('zakoncz', { id: t.id }))));
  }

  karta.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextButton()
      .setText(t ? '🔁 Przełącz na inną pracę' : '▶ Rozpocznij pracę')
      .setTextButtonStyle(t ? CardService.TextButtonStyle.OUTLINED : CardService.TextButtonStyle.FILLED)
      .setOnClickAction(akcja_('wyborProjektu', { tryb: 'start' })))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText('➕ Dodaj ręcznie')
        .setOnClickAction(akcja_('wyborProjektu', { tryb: 'reczny' })))
      .addButton(CardService.newTextButton().setText('📋 Moje sloty')
        .setOnClickAction(akcja_('listaSlotow', { strona: '0' })))));

  karta.addSection(sekcjaDnia_('Dziś', ctx, dzis, true));
  return karta.build();
}

function sekcjaDnia_(naglowek, ctx, data, pokazPusty) {
  const zDnia = ctx.sloty
    .filter(function (s) { return s.data === data; })
    .sort(function (a, b) { return (a.od || 0) - (b.od || 0); });

  const sekcja = CardService.newCardSection().setHeader(naglowek);
  if (zDnia.length === 0) {
    if (pokazPusty) sekcja.addWidget(CardService.newTextParagraph().setText('<font color="#888">Brak slotów.</font>'));
    return sekcja;
  }
  zDnia.forEach(function (s) { sekcja.addWidget(widgetSlotu_(s, ctx.teraz)); });
  return sekcja;
}

function widgetSlotu_(s, teraz) {
  const w = CardService.newDecoratedText().setWrapText(true);
  if (s.blad) {
    return w.setTopLabel('wiersz ' + s.wiersz).setText('⚠ ' + escapeHtml_(s.blad))
            .setBottomLabel('popraw ten wiersz bezpośrednio w arkuszu');
  }
  const trwa = s.do === null;
  w.setTopLabel(hhmm_(s.od) + '–' + (trwa ? 'trwa' : hhmm_(s.do)) + ' · '
              + czasTekst_(koniecEfektywny_(s, teraz) - s.od)
              + (s.status && s.status !== ST_ZAKONCZONY && s.status !== ST_TRWA ? ' · ' + s.status : ''))
   .setText(escapeHtml_(s.kod) + (s.nazwa ? ' – ' + escapeHtml_(s.nazwa) : ''))
   .setBottomLabel(s.zadanie || 'bez zadania')
   .setOnClickAction(akcja_('otworzSlot', { id: s.id }));
  return w;
}

function kartaBrakuPliku_() {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Roboczogodziny'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(
        'Nie masz jeszcze arkusza roboczogodzin.<br><br>'
        + 'Poproś administratora, żeby dodał Twój adres <b>' + escapeHtml_(mojEmail_()) + '</b> '
        + 'na listę pracowników w arkuszu zbiorczym. Potem odśwież Kalendarz.')))
    .build();
}

function kartaBledu_(tekst) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Roboczogodziny'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(escapeHtml_(tekst)))
      .addWidget(CardService.newTextButton().setText('Spróbuj ponownie')
        .setOnClickAction(CardService.newAction().setFunctionName('naStart'))))
    .build();
}

/** Powrót na kartę główną z odświeżeniem. */
function naStart() {
  return nawigacja_(CardService.newNavigation().popToRoot().updateCard(kartaGlownaBezpieczna_([])));
}

function poZapisie_(tekst) {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(kartaGlownaBezpieczna_([])))
    .setNotification(CardService.newNotification().setText(tekst))
    .build();
}


// ============================================================
// 3. ZAKOŃCZ
// ============================================================

function zakoncz(e) {
  const id = (e.parameters && e.parameters.id) || '';
  let tekst;
  try {
    tekst = zBlokada_(function () {
      const ctx = kontekst_();
      domknijTrwajacy_(ctx);
      const s = slotPoId_(ctx, id);
      if (s.do !== null) return 'Ten slot był już zakończony (' + hhmm_(s.od) + '–' + hhmm_(s.do) + ').';
      return zamknijSlot_(ctx, s, ctx.teraz.min);
    });
  } catch (err) {
    return powiadomienie_('Nie udało się zakończyć: ' + err.message);
  }
  return poZapisie_(tekst);
}

/**
 * Zamyka trwający slot o wskazanej minucie, ale nie później niż w chwili
 * osiągnięcia limitu. Slot krótszy niż minuta jest usuwany.
 */
function zamknijSlot_(ctx, s, minuta) {
  const inne = ctx.sloty.filter(function (x) { return x.id !== s.id; });
  const koniecLimitu = s.od + Math.max(0, ctx.limit - sumaDnia_(inne, s.data, ctx.teraz, null));
  const koniec = Math.min(minuta, koniecLimitu);

  if (koniec <= s.od) {
    ctx.sh.deleteRow(s.wiersz);
    ctx.sloty = ctx.sloty.filter(function (x) { return x !== s; });
    ctx.sloty.forEach(function (x) { if (x.wiersz > s.wiersz) x.wiersz--; });
    return 'Slot trwał krócej niż minutę – usunięto go.';
  }

  s.do = koniec;
  s.status = koniec < minuta ? ST_LIMIT : ST_ZAKONCZONY;
  zapiszWiersz_(ctx, s);
  return 'Zakończono: ' + opisSlotu_(s) + ' (' + czasTekst_(s.do - s.od) + ')'
       + (koniec < minuta ? ' – zamknięty godziną osiągnięcia limitu' : '');
}


// ============================================================
// 4. WYBÓR PROJEKTU (wyszukiwarka jak w dodatku „Zadanie projektowe”)
// ============================================================

// tryb: 'start' (Rozpocznij), 'reczny' (nowy slot ręcznie), 'zmiana' (zmiana projektu w edycji, z id)
function wyborProjektu(e) {
  return nawigacja_(CardService.newNavigation().pushCard(kartaProjektow_('', e.parameters || {})));
}

function szukaj(e) {
  return nawigacja_(CardService.newNavigation()
    .updateCard(kartaProjektow_(tekstZFormularza_(e, 'fraza'), e.parameters || {})));
}

function kartaProjektow_(fraza, p) {
  const tryb = { tryb: String(p.tryb || 'start'), id: String(p.id || '') };
  const wszystkie = wczytajProjekty_();
  const pasujace = filtruj_(wszystkie, fraza);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(tryb.tryb === 'start' ? 'Rozpocznij pracę' : tryb.tryb === 'zmiana' ? 'Zmień projekt' : 'Nowy slot')
      .setSubtitle('Wybierz projekt'));

  karta.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextInput()
      .setFieldName('fraza').setTitle('Szukaj projektu').setHint('kod lub fragment nazwy')
      .setValue(fraza || '').setOnChangeAction(akcja_('szukaj', tryb)))
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton().setText('Szukaj').setOnClickAction(akcja_('szukaj', tryb)))
      .addButton(CardService.newTextButton().setText('Wróć').setOnClickAction(akcja_('wroc', {})))));

  const wyniki = CardService.newCardSection();
  if (pasujace.length === 0) {
    wyniki.addWidget(CardService.newTextParagraph().setText('Brak wyników dla „' + escapeHtml_(fraza) + '”.'));
  }
  pasujace.slice(0, CONFIG.MAX_WYNIKOW).forEach(function (pr) {
    wyniki.addWidget(CardService.newDecoratedText()
      .setText(pr.kod).setBottomLabel(pr.nazwa).setWrapText(true)
      .setOnClickAction(akcja_('wybierzProjekt', Object.assign({ kod: String(pr.kod), nazwa: String(pr.nazwa) }, tryb))));
  });
  if (pasujace.length > CONFIG.MAX_WYNIKOW) {
    wyniki.addWidget(CardService.newTextParagraph()
      .setText('<font color="#888">Pokazano ' + CONFIG.MAX_WYNIKOW + ' z ' + pasujace.length + '. Doprecyzuj wyszukiwanie.</font>'));
  }
  karta.addSection(wyniki);

  if (CONFIG.POKAZ_LISTE && wszystkie.length) {
    const lista = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN).setFieldName('zListy').setTitle('Projekt');
    wszystkie.forEach(function (pr, i) {
      lista.addItem(pr.nazwa ? pr.kod + ' - ' + pr.nazwa : pr.kod, pr.kod + '|' + pr.nazwa, i === 0);
    });
    karta.addSection(CardService.newCardSection()
      .setHeader('Lub wybierz z listy (' + wszystkie.length + ')')
      .setCollapsible(true).setNumUncollapsibleWidgets(0)
      .addWidget(lista)
      .addWidget(CardService.newTextButton().setText('Wybierz')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(akcja_('wybierzProjekt', tryb))));
  }
  return karta.build();
}

function wybierzProjekt(e) {
  const p = e.parameters || {};
  let kod = p.kod || '', nazwa = p.nazwa || '';
  if (!kod) {
    const wartosc = tekstZFormularza_(e, 'zListy');
    const kreska = wartosc.indexOf('|');
    kod = kreska === -1 ? wartosc : wartosc.substring(0, kreska);
    nazwa = kreska === -1 ? '' : wartosc.substring(kreska + 1);
  }
  if (!kod) return powiadomienie_('Nie wybrano projektu.');

  let karta;
  try {
    karta = zBlokada_(function () {
      const ctx = kontekst_();
      if (p.tryb === 'start') return kartaStartu_(ctx, kod, nazwa, '');
      if (p.tryb === 'zmiana') {
        const s = slotPoId_(ctx, p.id);
        return kartaSlotu_(ctx, s, { kod: kod, nazwa: nazwa }, null, '');
      }
      return kartaSlotu_(ctx, null, { kod: kod, nazwa: nazwa }, null, '');
    });
  } catch (err) {
    return powiadomienie_('Błąd: ' + err.message);
  }
  return nawigacja_(CardService.newNavigation().pushCard(karta));
}

function wroc() {
  return nawigacja_(CardService.newNavigation().popCard());
}


// ============================================================
// 5. ROZPOCZNIJ
// ============================================================

function kartaStartu_(ctx, kod, nazwa, komunikat) {
  const teraz = ctx.teraz;
  const t = trwajacy_(ctx);
  const suma = sumaDnia_(ctx.sloty, teraz.data, teraz, null);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Rozpocznij pracę').setSubtitle(kod + (nazwa ? ' – ' + nazwa : '')));
  const sekcja = CardService.newCardSection();
  if (komunikat) sekcja.addWidget(komunikatBledu_(komunikat));

  sekcja.addWidget(poleZadania_(kod, ''));

  if (t) {
    sekcja.addWidget(CardService.newTextParagraph().setText(
      '<font color="#5f6368">Trwający slot <b>' + escapeHtml_(opisSlotu_(t)) + '</b> (od ' + hhmm_(t.od)
      + ') zostanie zakończony o ' + hhmm_(teraz.min) + ', a nowy zacznie się w tej samej minucie.</font>'));
  } else {
    const poprzedni = koniecPoprzedniego_(ctx.sloty, teraz.data, teraz.min, null);
    if (poprzedni !== null && poprzedni < teraz.min) {
      const przerwa = teraz.min - poprzedni;
      const odPoprzedniego = przerwa <= CONFIG.PRZERWA_DO_DOMKNIECIA_MIN;
      sekcja.addWidget(CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.RADIO_BUTTON)
        .setFieldName('odKiedy').setTitle('Początek')
        .addItem('Teraz (' + hhmm_(teraz.min) + ')', 'teraz', !odPoprzedniego)
        .addItem('Od końca poprzedniego slotu (' + hhmm_(poprzedni) + ') – bez przerwy ' + czasTekst_(przerwa),
                 'poprzedni', odPoprzedniego));
    } else {
      sekcja.addWidget(CardService.newTextParagraph()
        .setText('<font color="#5f6368">Początek: teraz (' + hhmm_(teraz.min) + ').</font>'));
    }
  }

  sekcja.addWidget(CardService.newTextParagraph().setText('<font color="#5f6368">Dziś przepracowano '
    + czasTekst_(suma) + ' z ' + czasTekst_(ctx.limit) + '.</font>'));

  sekcja.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton().setText('▶ Rozpocznij')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(akcja_('rozpocznij', { kod: String(kod), nazwa: String(nazwa || '') })))
    .addButton(CardService.newTextButton().setText('Wróć').setOnClickAction(akcja_('wroc', {}))));

  karta.addSection(sekcja);
  return karta.build();
}

function rozpocznij(e) {
  const p = e.parameters || {};
  const zadanie = rozbierzZadanie_(tekstZFormularza_(e, 'zadanie'));
  const odKiedy = tekstZFormularza_(e, 'odKiedy') || 'teraz';

  let wynik;
  try {
    wynik = zBlokada_(function () {
      const ctx = kontekst_();
      domknijTrwajacy_(ctx);
      const teraz = ctx.teraz;

      // 1. Plan zmian w pamięci – NIC nie zapisujemy, dopóki całość nie przejdzie sprawdzenia.
      const t = trwajacy_(ctx);
      let od = teraz.min;
      if (!t && odKiedy === 'poprzedni') {
        const poprzedni = koniecPoprzedniego_(ctx.sloty, teraz.data, teraz.min, null);
        if (poprzedni !== null) od = poprzedni;
      }
      const nowy = {
        id: nowyIdSlotu_(), data: teraz.data, od: od, do: null, kod: p.kod, nazwa: p.nazwa,
        zadanie: zadanie.temat, idZadania: zadanie.id, status: ST_TRWA, komunikat: '',
      };

      // Sprawdzenie na slotach PO planowanym zamknięciu trwającego.
      const poZamknieciu = ctx.sloty.map(function (s) {
        return s === t ? Object.assign({}, s, { do: Math.max(s.od, teraz.min) }) : s;
      });
      if (sumaDnia_(poZamknieciu, teraz.data, teraz, null) >= ctx.limit) {
        return { blad: 'Dzienny limit ' + czasTekst_(ctx.limit) + ' jest już wykorzystany – nie można rozpocząć kolejnej pracy.' };
      }
      const blad = sprawdzSlot_(nowy, poZamknieciu, ctx.limit, teraz);
      if (blad) return { blad: blad };

      // 2. Zapis.
      let info = '';
      if (t) info = zamknijSlot_(ctx, t, teraz.min) + ' ';
      dopiszWiersz_(ctx, nowy);
      return { tekst: info + 'Rozpoczęto: ' + opisSlotu_(nowy) + ' od ' + hhmm_(nowy.od) };
    });
  } catch (err) {
    return powiadomienie_('Nie udało się rozpocząć: ' + err.message);
  }

  if (wynik.blad) {
    const ctx = kontekst_();
    return nawigacja_(CardService.newNavigation().updateCard(kartaStartu_(ctx, p.kod, p.nazwa, wynik.blad)));
  }
  return poZapisie_(wynik.tekst);
}


// ============================================================
// 6. SLOT – dodanie ręczne i edycja
// ============================================================

function otworzSlot(e) {
  const id = (e.parameters && e.parameters.id) || '';
  let karta;
  try {
    karta = zBlokada_(function () {
      const ctx = kontekst_();
      const s = slotPoId_(ctx, id);
      return kartaSlotu_(ctx, s, { kod: s.kod, nazwa: s.nazwa }, null, '');
    });
  } catch (err) {
    return powiadomienie_('Błąd: ' + err.message);
  }
  return nawigacja_(CardService.newNavigation().pushCard(karta));
}

/**
 * @param s        edytowany slot albo null (nowy)
 * @param projekt  { kod, nazwa } – przy „Zmień projekt” inny niż w slocie
 * @param w        wartości z formularza po błędzie ({data, od, do, zadanie}) albo null
 */
function kartaSlotu_(ctx, s, projekt, w, komunikat) {
  const nowy = !s;
  const trwa = !!s && s.do === null;
  const teraz = ctx.teraz;

  let v;
  if (w) {
    v = w;
  } else if (s) {
    v = { data: s.data, od: s.od, do: s.do, zadanie: s.idZadania + '|' + s.zadanie };
  } else {
    // Nowy slot: domyślnie od końca ostatniego dzisiejszego slotu (albo godzinę temu) do teraz.
    const poprzedni = koniecPoprzedniego_(ctx.sloty, teraz.data, teraz.min, null);
    const od = poprzedni !== null ? poprzedni : Math.max(0, teraz.min - 60);
    v = { data: teraz.data, od: od, do: Math.max(od, teraz.min), zadanie: '|' };
  }

  const p = { id: s ? s.id : '', kod: String(projekt.kod), nazwa: String(projekt.nazwa || '') };

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(nowy ? 'Nowy slot' : (trwa ? 'Trwający slot' : 'Edycja slotu'))
      .setSubtitle(projekt.kod + (projekt.nazwa ? ' – ' + projekt.nazwa : '')));

  const sekcja = CardService.newCardSection();
  if (komunikat) sekcja.addWidget(komunikatBledu_(komunikat));

  sekcja.addWidget(poleZadania_(projekt.kod, (s && projekt.kod === s.kod) || w ? v.zadanie : ''));

  if (trwa) {
    sekcja.addWidget(CardService.newTextParagraph()
      .setText('<font color="#5f6368">Slot trwa od ' + hhmm_(s.od) + ' (' + s.data + '). '
             + 'Możesz poprawić godzinę rozpoczęcia i zadanie; kończy się go przyciskiem „⏹ Zakończ”.</font>'));
  } else {
    sekcja.addWidget(CardService.newDatePicker()
      .setFieldName('data').setTitle('Data *').setValueInMsSinceEpoch(msZDaty_(v.data)));
  }

  sekcja.addWidget(CardService.newTimePicker()
    .setFieldName('od').setTitle('Od *').setHours(Math.floor(v.od / 60)).setMinutes(v.od % 60));

  if (!trwa) {
    const doo = (v.do === null || v.do === undefined) ? v.od : v.do;
    sekcja.addWidget(CardService.newTimePicker()
      .setFieldName('do').setTitle('Do *').setHours(Math.floor(doo / 60)).setMinutes(doo % 60));
  }

  sekcja.addWidget(CardService.newTextButton()
    .setText('⏮ Zacznij od końca poprzedniego slotu')
    .setOnClickAction(akcja_('odKoncaPoprzedniego', p)));

  sekcja.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton().setText('Zapisz')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(akcja_('zapiszSlot', p)))
    .addButton(CardService.newTextButton().setText('Wróć').setOnClickAction(akcja_('wroc', {}))));
  karta.addSection(sekcja);

  if (!nowy) {
    karta.addSection(CardService.newCardSection()
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton().setText('Zmień projekt')
          .setOnClickAction(akcja_('wyborProjektu', { tryb: 'zmiana', id: s.id })))
        .addButton(CardService.newTextButton().setText('🗑 Usuń slot')
          .setOnClickAction(akcja_('usunSlot', { id: s.id }))))
      .addWidget(CardService.newDecoratedText()
        .setTopLabel(s.id + (s.status ? ' · ' + s.status : ''))
        .setText('Otwórz mój arkusz roboczogodzin').setWrapText(true)
        .setOpenLink(CardService.newOpenLink().setUrl(ctx.url))));
  }
  return karta.build();
}

/** Wartości z formularza slotu. */
function wartosciFormularza_(e, s) {
  const godzina = function (pole) {
    const fi = e && e.commonEventObject && e.commonEventObject.formInputs;
    const t = fi && fi[pole] && fi[pole].timeInput;
    return t ? Number(t.hours) * 60 + Number(t.minutes) : null;
  };
  const trwa = !!s && s.do === null;
  // Pola daty i „Do” nie ma na formularzu trwającego slotu – wtedy bierzemy je ze slotu.
  // (Gdy slot w międzyczasie zamknął automat, zostaje jego godzina zamknięcia.)
  const doZFormularza = godzina('do');
  return {
    data: dataTekst_(dataZFormularza_(e, 'data')) || (s ? s.data : ''),
    od: godzina('od'),
    do: trwa ? null : (doZFormularza !== null ? doZFormularza : (s ? s.do : null)),
    zadanie: tekstZFormularza_(e, 'zadanie') || '|',
  };
}

function odKoncaPoprzedniego(e) {
  const p = e.parameters || {};
  try {
    const karta = zBlokada_(function () {
      const ctx = kontekst_();
      const s = p.id ? slotPoId_(ctx, p.id) : null;
      const w = wartosciFormularza_(e, s);
      const przed = (w.do !== null && w.do !== undefined) ? w.do
                  : (w.data === ctx.teraz.data ? ctx.teraz.min : 24 * 60);
      const poprzedni = koniecPoprzedniego_(ctx.sloty, w.data, przed, p.id || null);
      if (poprzedni === null) {
        return kartaSlotu_(ctx, s, { kod: p.kod, nazwa: p.nazwa }, w,
          'W dniu ' + w.data + ' nie ma wcześniejszego zakończonego slotu, od którego można by zacząć.');
      }
      w.od = poprzedni;
      if (w.do !== null && w.do < w.od) w.do = w.od;
      return kartaSlotu_(ctx, s, { kod: p.kod, nazwa: p.nazwa }, w, '');
    });
    return nawigacja_(CardService.newNavigation().updateCard(karta));
  } catch (err) {
    return powiadomienie_('Błąd: ' + err.message);
  }
}

function zapiszSlot(e) {
  const p = e.parameters || {};
  let wynik;
  try {
    wynik = zBlokada_(function () {
      const ctx = kontekst_();
      domknijTrwajacy_(ctx);
      const s = p.id ? slotPoId_(ctx, p.id) : null;
      const w = wartosciFormularza_(e, s);
      const zadanie = rozbierzZadanie_(w.zadanie);

      const kandydat = {
        id: s ? s.id : nowyIdSlotu_(), wiersz: s ? s.wiersz : null,
        data: w.data, od: w.od, do: w.do,
        kod: p.kod, nazwa: p.nazwa, zadanie: zadanie.temat, idZadania: zadanie.id,
        status: w.do === null ? ST_TRWA : ST_ZAKONCZONY, komunikat: '',
      };
      const blad = sprawdzSlot_(kandydat, ctx.sloty, ctx.limit, ctx.teraz);
      if (blad) return { blad: blad, karta: kartaSlotu_(ctx, s, { kod: p.kod, nazwa: p.nazwa }, w, blad) };

      if (s) { zapiszWiersz_(ctx, kandydat); return { tekst: 'Zapisano zmiany w slocie.' }; }
      dopiszWiersz_(ctx, kandydat);
      return { tekst: 'Dodano slot ' + hhmm_(kandydat.od) + '–' + hhmm_(kandydat.do) + ' (' + czasTekst_(kandydat.do - kandydat.od) + ').' };
    });
  } catch (err) {
    return powiadomienie_('Nie udało się zapisać: ' + err.message);
  }
  if (wynik.blad) return nawigacja_(CardService.newNavigation().updateCard(wynik.karta));
  return poZapisie_(wynik.tekst);
}

function usunSlot(e) {
  const id = (e.parameters && e.parameters.id) || '';
  let karta;
  try {
    karta = zBlokada_(function () {
      const ctx = kontekst_();
      const s = slotPoId_(ctx, id);
      return CardService.newCardBuilder()
        .setHeader(CardService.newCardHeader().setTitle('Usunąć slot?'))
        .addSection(CardService.newCardSection()
          .addWidget(widgetSlotu_(s, ctx.teraz).setOnClickAction(akcja_('wroc', {})))
          .addWidget(CardService.newTextParagraph().setText('Tej operacji nie można cofnąć.'))
          .addWidget(CardService.newButtonSet()
            .addButton(CardService.newTextButton().setText('Tak, usuń')
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
              .setOnClickAction(akcja_('usunPotwierdzone', { id: id })))
            .addButton(CardService.newTextButton().setText('Anuluj').setOnClickAction(akcja_('wroc', {})))))
        .build();
    });
  } catch (err) {
    return powiadomienie_('Błąd: ' + err.message);
  }
  return nawigacja_(CardService.newNavigation().pushCard(karta));
}

function usunPotwierdzone(e) {
  const id = (e.parameters && e.parameters.id) || '';
  try {
    zBlokada_(function () {
      const ctx = kontekst_();
      const s = slotPoId_(ctx, id);
      ctx.sh.deleteRow(s.wiersz);
    });
  } catch (err) {
    return powiadomienie_('Nie udało się usunąć: ' + err.message);
  }
  return poZapisie_('Usunięto slot.');
}


// ============================================================
// 7. MOJE SLOTY – przegląd dzień po dniu
// ============================================================

function listaSlotow(e) {
  const strona = Number((e.parameters && e.parameters.strona) || 0);
  let karta;
  try {
    karta = zBlokada_(function () { return kartaListy_(kontekst_(), strona); });
  } catch (err) {
    return powiadomienie_('Błąd: ' + err.message);
  }
  const nav = CardService.newNavigation();
  return nawigacja_(e.parameters && e.parameters.zamien === '1' ? nav.updateCard(karta) : nav.pushCard(karta));
}

function kartaListy_(ctx, strona) {
  const dni = [];
  ctx.sloty.forEach(function (s) { if (s.data && dni.indexOf(s.data) === -1) dni.push(s.data); });
  dni.sort().reverse();

  const odDnia = strona * CONFIG.DNI_NA_STRONIE;
  const naStronie = dni.slice(odDnia, odDnia + CONFIG.DNI_NA_STRONIE);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Moje sloty')
      .setSubtitle(dni.length ? 'dni ze slotami: ' + dni.length : 'brak wpisów'));

  if (dni.length === 0) {
    karta.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText('Nie masz jeszcze żadnych slotów.')));
  }

  naStronie.forEach(function (d) {
    const suma = sumaDnia_(ctx.sloty, d, ctx.teraz, null);
    const ponad = suma > ctx.limit ? ' ⚠ ponad limit' : '';
    karta.addSection(sekcjaDnia_(d + ' (' + dzienTygodnia_(d) + ') – ' + czasTekst_(suma) + ponad, ctx, d, false));
  });

  const bledne = ctx.sloty.filter(function (s) { return s.blad; });
  if (strona === 0 && bledne.length) {
    const sb = CardService.newCardSection().setHeader('⚠ Wiersze do poprawienia w arkuszu');
    bledne.forEach(function (s) { sb.addWidget(widgetSlotu_(s, ctx.teraz)); });
    karta.addSection(sb);
  }

  const przyciski = CardService.newButtonSet();
  if (strona > 0) {
    przyciski.addButton(CardService.newTextButton().setText('← Nowsze')
      .setOnClickAction(akcja_('listaSlotow', { strona: String(strona - 1), zamien: '1' })));
  }
  if (odDnia + CONFIG.DNI_NA_STRONIE < dni.length) {
    przyciski.addButton(CardService.newTextButton().setText('Starsze →')
      .setOnClickAction(akcja_('listaSlotow', { strona: String(strona + 1), zamien: '1' })));
  }
  przyciski.addButton(CardService.newTextButton().setText('Wróć').setOnClickAction(akcja_('naStart', {})));

  karta.addSection(CardService.newCardSection()
    .addWidget(przyciski)
    .addWidget(CardService.newDecoratedText().setText('Otwórz mój arkusz roboczogodzin')
      .setOpenLink(CardService.newOpenLink().setUrl(ctx.url))));
  return karta.build();
}

function dzienTygodnia_(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return DNI_TYGODNIA[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()];
}


// ============================================================
// 8. ZADANIA PROJEKTU (opcjonalne)
// ============================================================

/** Lista wyboru zadania: „— bez zadania —” + aktywne zadania z listy „#KOD …”. */
function poleZadania_(kod, wybrane) {
  const pole = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('zadanie').setTitle('Zadanie (opcjonalnie)');

  const zadania = zadaniaProjektu_(kod);
  const wybraneId = String(wybrane || '|');
  let zaznaczone = false;

  const opcje = [{ etykieta: '— bez zadania —', wartosc: '|' }];
  zadania.forEach(function (z) { opcje.push({ etykieta: z.temat, wartosc: z.id + '|' + z.temat }); });

  // Zadanie zapisane w slocie, którego już nie ma na liście (np. ukończone) – zostawiamy je do wyboru.
  if (wybraneId !== '|' && !opcje.some(function (o) { return o.wartosc === wybraneId; })) {
    opcje.push({ etykieta: rozbierzZadanie_(wybraneId).temat + ' (spoza listy)', wartosc: wybraneId });
  }

  opcje.forEach(function (o) {
    const tak = !zaznaczone && o.wartosc === wybraneId;
    if (tak) zaznaczone = true;
    pole.addItem(o.etykieta, o.wartosc, tak);
  });
  return pole;
}

function rozbierzZadanie_(wartosc) {
  const s = String(wartosc || '|');
  const kreska = s.indexOf('|');
  if (kreska === -1) return { id: '', temat: s };
  return { id: s.substring(0, kreska), temat: s.substring(kreska + 1) };
}

/** Aktywne zadania projektu. Brak listy albo brak dostępu = pusta lista (zadanie jest opcjonalne). */
function zadaniaProjektu_(kod) {
  try {
    const k = String(kod || '').trim().toUpperCase();
    let mapa = mapaListZadan_(false);
    if (!mapa[k]) mapa = mapaListZadan_(true);
    const pliki = mapa[k] || [];
    if (pliki.length !== 1) return [];

    const arkusz = kartaZadan_(SpreadsheetApp.openById(pliki[0].id));
    if (!arkusz || arkusz.getLastRow() < 2) return [];

    const dane = arkusz.getRange(2, 1, arkusz.getLastRow() - 1, KOL_ZADAN.idSystemowe).getValues();
    const zamkniete = ['ukończone', 'ukonczone', 'zakończone', 'zakonczone', 'anulowane'];
    const wynik = [];
    dane.forEach(function (r) {
      const temat = tekstRG_(r[KOL_ZADAN.temat - 1]).replace(/\|/g, '/');
      const status = tekstRG_(r[KOL_ZADAN.status - 1]).toLowerCase();
      if (!temat || zamkniete.indexOf(status) !== -1) return;
      wynik.push({ temat: temat, id: tekstRG_(r[KOL_ZADAN.idSystemowe - 1]) });
    });
    return wynik;
  } catch (err) {
    console.warn('Zadania projektu ' + kod + ' niedostępne: ' + err.message);
    return [];
  }
}

/**
 * Karta z „Temat” w A1. Sprawdza karty po kolei i kończy na pierwszej pasującej.
 * Karty bez komórek (np. osobna karta z wykresem) rzucają „Range not found” –
 * takie pomijamy, zamiast przerywać odczyt całej listy.
 */
function kartaZadan_(ss) {
  const arkusze = ss.getSheets();
  for (let i = 0; i < arkusze.length; i++) {
    try {
      if (tekstRG_(arkusze[i].getRange(1, 1).getValue()).toLowerCase() === NAGLOWEK_KARTY_ZADAN) return arkusze[i];
    } catch (e) {
      // karta bez komórek – pomijamy
    }
  }
  return null;
}

function mapaListZadan_(odswiez) {
  const cache = CacheService.getScriptCache();
  if (!odswiez) {
    const zapisane = cache.get(KLUCZ_CACHE_PLIKOW);
    if (zapisane) return JSON.parse(zapisane);
  }

  const mapa = {};
  const doOdwiedzenia = [DriveApp.getFolderById(CONFIG.ID_FOLDERU_PROJEKTOW)];
  while (doOdwiedzenia.length) {
    const folder = doOdwiedzenia.pop();
    const podfoldery = folder.getFolders();
    while (podfoldery.hasNext()) doOdwiedzenia.push(podfoldery.next());
    const pliki = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (pliki.hasNext()) {
      const f = pliki.next();
      const kod = kodZNazwyPliku_(f.getName());
      if (!kod) continue;
      (mapa[kod] = mapa[kod] || []).push({ id: f.getId(), nazwa: f.getName() });
    }
  }
  try { cache.put(KLUCZ_CACHE_PLIKOW, JSON.stringify(mapa), CONFIG.CZAS_CACHE_PLIKOW); }
  catch (e) { console.warn('Cache mapy list: ' + e.message); }
  return mapa;
}

/** „#PRJ001 Zadania – …” → „PRJ001”; bez # na początku albo bez cyfry w kodzie → null. */
function kodZNazwyPliku_(nazwa) {
  const s = String(nazwa || '');
  if (s.charAt(0) !== CONFIG.ZNACZNIK_PLIKU) return null;
  const m = s.substring(1).match(/^\s*([A-Za-z0-9_]+)/);
  if (!m) return null;
  const kod = m[1].toUpperCase();
  return /[0-9]/.test(kod) ? kod : null;
}


// ============================================================
// 9. SŁOWNIK PROJEKTÓW – jak w dodatku „Zadanie projektowe”
// ============================================================

function filtruj_(projekty, fraza) {
  const tekst = String(fraza || '').trim().toLowerCase();
  if (!tekst) return projekty;
  const slowa = tekst.split(/\s+/).filter(function (s) { return s.length > 0; });
  return projekty.filter(function (p) {
    const gdzie = (p.kod + ' ' + p.nazwa).toLowerCase();
    return slowa.every(function (s) { return gdzie.indexOf(s) !== -1; });
  });
}

function wczytajProjekty_() {
  const cache = CacheService.getScriptCache();
  const zapisane = cache.get(KLUCZ_CACHE);
  if (zapisane) return JSON.parse(zapisane);

  const plik = SpreadsheetApp.openById(CONFIG.ID_ARKUSZA);
  const projekty = [];
  const widziane = {};

  CONFIG.ZAKLADKI.forEach(function (z) {
    const arkusz = plik.getSheetByName(z.nazwa);
    if (!arkusz) { console.warn('Brak zakładki "' + z.nazwa + '" – pomijam.'); return; }
    const ostatni = arkusz.getLastRow();
    if (ostatni < z.wierszDanych) return;

    const dane = arkusz.getRange(z.wierszDanych, 1, ostatni - z.wierszDanych + 1,
                                 Math.max(z.kolKod, z.kolNazwa, z.kolFiltr)).getValues();
    const zTej = [];
    for (let i = 0; i < dane.length; i++) {
      const kod = String(dane[i][z.kolKod - 1] || '').trim().toUpperCase();
      const nazwa = String(dane[i][z.kolNazwa - 1] || '').trim().replace(/_/g, ' ');
      const filtr = String(dane[i][z.kolFiltr - 1] || '').trim().toLowerCase();
      if (!kod || !/[0-9]/.test(kod)) continue;
      if (filtr.indexOf('dubel') !== -1 || filtr.indexOf('nieaktywn') !== -1) continue;
      if (z.dozwolone.length > 0 && !z.dozwolone.some(function (d) { return filtr.indexOf(d) !== -1; })) continue;
      if (widziane[kod]) continue;
      widziane[kod] = true;
      zTej.push({ kod: kod, nazwa: nazwa, grupa: z.grupa });
    }
    if (CONFIG.ODWROC_KOLEJNOSC) zTej.reverse();
    Array.prototype.push.apply(projekty, zTej);
  });

  try { cache.put(KLUCZ_CACHE, JSON.stringify(projekty), CONFIG.CZAS_CACHE); }
  catch (e) { console.warn('Cache projektów: ' + e.message); }
  return projekty;
}


// ============================================================
// 10. POMOCNICZE
// ============================================================

function akcja_(funkcja, parametry) {
  return CardService.newAction().setFunctionName(funkcja).setParameters(parametry || {});
}

function nawigacja_(nav) {
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function powiadomienie_(tekst) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(tekst)).build();
}

function komunikatBledu_(tekst) {
  return CardService.newTextParagraph().setText('<font color="#d93025"><b>' + escapeHtml_(tekst) + '</b></font>');
}

function tekstZFormularza_(e, pole) {
  const fi = e && e.commonEventObject && e.commonEventObject.formInputs;
  if (fi && fi[pole] && fi[pole].stringInputs && fi[pole].stringInputs.value) {
    return tekstRG_(fi[pole].stringInputs.value[0]);
  }
  return tekstRG_(e && e.formInput && e.formInput[pole]);
}

// Pole daty zwraca północ UTC wybranego dnia – dlatego formatujemy w UTC.
function dataZFormularza_(e, pole) {
  const fi = e && e.commonEventObject && e.commonEventObject.formInputs;
  if (fi && fi[pole] && fi[pole].dateInput && fi[pole].dateInput.msSinceEpoch) {
    return Number(fi[pole].dateInput.msSinceEpoch);
  }
  return null;
}

function dataTekst_(ms) {
  if (!ms) return '';
  return Utilities.formatDate(new Date(Number(ms)), 'UTC', 'yyyy-MM-dd');
}

function msZDaty_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.now();
}

function escapeHtml_(t) {
  return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ============================================================
// 11. DO TESTÓW W EDYTORZE
// ============================================================

/** Sprawdza, czy dodatek znajduje Twój arkusz i co w nim widzi. */
function testMojegoArkusza() {
  CacheService.getUserCache().remove(KLUCZ_PLIKU_PRACOWNIKA);
  try {
    const ctx = kontekst_();
    console.log('✅ Arkusz: ' + ctx.ss.getName() + ' | ' + ctx.url);
    console.log('Limit dzienny: ' + czasTekst_(ctx.limit) + ' | slotów: ' + ctx.sloty.length
              + ' | dziś: ' + czasTekst_(sumaDnia_(ctx.sloty, ctx.teraz.data, ctx.teraz, null)));
    const t = trwajacy_(ctx);
    console.log(t ? 'Trwa: ' + opisSlotu_(t) + ' od ' + hhmm_(t.od) : 'Nic nie trwa.');
    ctx.sloty.filter(function (s) { return s.blad; })
      .forEach(function (s) { console.log('⚠ wiersz ' + s.wiersz + ': ' + s.blad); });
  } catch (err) {
    console.log(err.message === 'BRAK_PLIKU'
      ? '❌ Nie znaleziono arkusza „' + CONFIG.PREFIKS_NAZWY + mojEmail_() + '”. Czy administrator go utworzył i udostępnił?'
      : '❌ ' + err.message);
  }
}

function wyczyscCache() {
  CacheService.getScriptCache().removeAll([KLUCZ_CACHE, KLUCZ_CACHE_PLIKOW]);
  CacheService.getUserCache().remove(KLUCZ_PLIKU_PRACOWNIKA);
  console.log('Cache wyczyszczony.');
}
