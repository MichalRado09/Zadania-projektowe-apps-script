// ============================================================
// DODATEK „ZADANIE PROJEKTOWE” – panel boczny Kalendarza Google
// Wersja 2 – dochodzi EDYCJA ISTNIEJĄCYCH ZADAŃ
// ============================================================
//
// Jak wygląda praca z dodatkiem:
//   1. Wybór projektu ze słownika kodów projektów (arkusz ze słownikiem).
//   2. Karta projektu: przycisk „➕ Nowe zadanie” oraz lista istniejących
//      zadań z listy zadań projektu (plik „#KOD …”), z wyszukiwarką.
//   3a. „Nowe zadanie” → formularz → dodatek dopisuje nowy wiersz.
//   3b. Kliknięcie zadania → formularz edycji → dodatek zmienia TEN SAM
//       wiersz w pliku (temat, opis, osoba, daty, status) i ewentualnie
//       dopisuje notatkę z dzisiejszą datą.
//
// Czego dodatek NIE robi:
//   Nie dotyka kalendarza. Wydarzenia tworzy i aktualizuje synchronizacja
//   bazy głównej – dla niej zmiana zrobiona przez dodatek niczym się nie
//   różni od ręcznej edycji w pliku. Dzięki temu pracownicy nie potrzebują
//   prawa edycji kalendarza, a każde zadanie ma jedno miejsce – listę projektu.
//
// Skąd dodatek wie, do którego pliku pisać:
//   Z nazwy pliku: „#KOD cokolwiek”, np. „#PRJ001 Zadania – Nazwa projektu”.
//   Najpierw znak #, zaraz po nim kod projektu, potem spacja.
//
// ZMIENIONE WZGLĘDEM WERSJI 1:
//   • Po wybraniu projektu nie otwiera się od razu formularz nowego
//     zadania, tylko karta projektu z listą jego zadań.
//   • Edycja istniejących zadań. Zadanie jest odnajdywane w pliku po
//     identyfikatorze z kolumny H („ID Systemowe”), a NIE po numerze
//     wiersza – gdyby ktoś w międzyczasie wstawił albo usunął wiersz nad
//     zadaniem, zapis po numerze trafiłby w cudze zadanie.
//   • Ochrona przed nadpisaniem cudzej zmiany: jeśli między otwarciem
//     formularza a zapisem ktoś inny zmienił to samo zadanie, dodatek
//     niczego nie nadpisuje, tylko pokazuje aktualną wersję.
//   • Notatki są tylko DOPISYWANE (z datą), nigdy nadpisywane – tak samo
//     jak w skrypcie notatek w pliku i przy notatkach z kalendarza.
// ============================================================


// ============================================================
// KONFIGURACJA
// ============================================================

const CONFIG = {

  // ⬇ Arkusz-słownik z listą kodów i nazw projektów.
  ID_ARKUSZA: 'TU_WKLEJ_ID_ARKUSZA_SLOWNIKA',

  // ⬇ Folder z projektami – ten sam, który skanuje baza główna.
  //   Szukamy w nim (i we wszystkich podfolderach) list zadań „#KOD …”.
  ID_FOLDERU_PROJEKTOW: 'TU_WKLEJ_ID_FOLDERU_PROJEKTOW',

  // Znak na początku nazwy pliku z listą zadań – ten sam, co w bazie głównej.
  ZNACZNIK_PLIKU: '#',

  // Status nowego zadania. Musi być na liście wyboru w kolumnie Status.
  STATUS_POCZATKOWY: 'Planowane',

  // Statusy do wyboru przy edycji – te same, co na liście w kolumnie Status.
  LISTA_STATUSOW: ['Planowane', 'W trakcie', 'Oczekujące', 'Wstrzymane', 'Ukończone', 'Anulowane'],

  // Czy w polu „Osoba” nowego zadania podpowiadać adres osoby, która je tworzy.
  PODPOWIADAJ_MOJ_EMAIL: true,

  // Ile zadań pokazywać w każdej sekcji karty projektu. Resztę znajdzie
  // wyszukiwarka – bardzo długa karta robi się ciężka i wolna.
  MAX_ZADAN_NA_LISCIE: 30,

  // Zakładki słownika – PRZYKŁADOWA konfiguracja, dostosuj do własnego arkusza:
  //   wierszDanych – pierwszy wiersz z danymi, kol* – numery kolumn,
  //   dozwolone – wartości kolumny filtra, które mają trafić na listę (pusto = wszystkie).
  ZAKLADKI: [
    {
      nazwa: 'OFERTY',
      wierszDanych: 3,
      kolKod: 1,
      kolNazwa: 2,
      kolFiltr: 4,
      dozwolone: ['otwarta'],
      grupa: 'Oferta',
    },
    {
      nazwa: 'PROJEKTY',
      wierszDanych: 4,
      kolKod: 1,
      kolNazwa: 2,
      kolFiltr: 3,
      dozwolone: ['aktywny'],
      grupa: 'Projekt',
    },
  ],

  POKAZ_GRUPE: false,
  ODWROC_KOLEJNOSC: true,
  POKAZ_LISTE: true,
  MAX_WYNIKOW: 40,

  // Lista projektów: 6 h (maksimum w Apps Script).
  CZAS_CACHE: 21600,

  // Mapa „kod → plik z zadaniami”: 10 minut. A jeśli kodu w pamięci nie ma,
  // dodatek i tak przeszuka folder od nowa.
  CZAS_CACHE_PLIKOW: 600,
};

// Ten dodatek to osobny projekt Apps Script, więc ma własny cache –
// niezależny od innych projektów. Przy zmianie zawartości listy podbij wersję.
const KLUCZ_CACHE = 'projekty_v1';
const KLUCZ_CACHE_PLIKOW = 'listy_zadan_v1';

// Układ kolumn listy zadań – DOKŁADNIE ten, który czyta synchronizacja.
// Dodatek zapisuje tylko A–G. Kolumnę H (ID Systemowe) tylko ODCZYTUJE,
// żeby odnaleźć zadanie; H–M uzupełnia i utrzymuje synchronizacja.
const KOL = { temat: 1, opis: 2, email: 3, dataOd: 4, dataDo: 5, status: 6, notatki: 7, idSystemowe: 8 };
const KOL_OSTATNIA_SYSTEMOWA = 13;
const NAGLOWEK_KARTY_ZADAN = 'temat';


// ============================================================
// 1. OTWARCIE PANELU W KALENDARZU
// ============================================================

function onHomepage(e) {
  try {
    return budujKarte_('');
  } catch (blad) {
    console.error('Błąd: ' + blad.message);
    return budujKarteBledu_('Wystąpił błąd: ' + blad.message);
  }
}


// ============================================================
// 2. WYBÓR PROJEKTU (wyszukiwarka)
// ============================================================

function szukaj(e) {
  const fraza = tekstZFormularza_(e, 'fraza');
  return nawigacja_(CardService.newNavigation().updateCard(budujKarte_(fraza)));
}

function budujKarte_(fraza) {

  const wszystkie = wczytajProjekty_();
  const pasujace = filtruj_(wszystkie, fraza);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Zadanie projektowe')
      .setSubtitle('Wybierz projekt'));

  karta.addSection(sekcjaWyszukiwania_(fraza));
  karta.addSection(sekcjaWynikow_(pasujace, fraza));

  if (CONFIG.POKAZ_LISTE) {
    karta.addSection(sekcjaPelnejListy_(wszystkie));
  }

  return karta.build();
}

function sekcjaWyszukiwania_(fraza) {

  const pole = CardService.newTextInput()
    .setFieldName('fraza')
    .setTitle('Szukaj projektu')
    .setHint('kod lub fragment nazwy')
    .setValue(fraza)
    .setOnChangeAction(CardService.newAction().setFunctionName('szukaj'));

  const przycisk = CardService.newTextButton()
    .setText('Szukaj')
    .setOnClickAction(CardService.newAction().setFunctionName('szukaj'));

  return CardService.newCardSection()
    .addWidget(pole)
    .addWidget(przycisk);
}

function sekcjaWynikow_(pasujace, fraza) {

  const sekcja = CardService.newCardSection();

  if (pasujace.length === 0) {
    sekcja.addWidget(CardService.newTextParagraph()
      .setText('Brak wyników dla „' + escapeHtml_(fraza) + '".'));
    return sekcja;
  }

  pasujace.slice(0, CONFIG.MAX_WYNIKOW).forEach(function (p) {

    // Wartości w setParameters muszą być tekstem – liczba powoduje błąd.
    const akcja = CardService.newAction()
      .setFunctionName('wybierzZWynikow')
      .setParameters({ kod: String(p.kod), nazwa: String(p.nazwa) });

    const wiersz = CardService.newDecoratedText()
      .setText(p.kod)
      .setBottomLabel(p.nazwa)
      .setWrapText(true)
      .setOnClickAction(akcja);

    if (CONFIG.POKAZ_GRUPE) {
      wiersz.setTopLabel(p.grupa);
    }

    sekcja.addWidget(wiersz);
  });

  if (pasujace.length > CONFIG.MAX_WYNIKOW) {
    sekcja.addWidget(CardService.newTextParagraph()
      .setText('<font color="#888">Pokazano ' + CONFIG.MAX_WYNIKOW
             + ' z ' + pasujace.length + '. Doprecyzuj wyszukiwanie.</font>'));
  }

  return sekcja;
}

function sekcjaPelnejListy_(projekty) {

  const lista = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('zListy')
    .setTitle('Projekt');

  // Wartość = kod|nazwa, żeby po wyborze nie szukać nazwy ponownie.
  projekty.forEach(function (p, indeks) {
    const etykieta = p.nazwa ? (p.kod + ' - ' + p.nazwa) : p.kod;
    lista.addItem(etykieta, p.kod + '|' + p.nazwa, indeks === 0);
  });

  const przycisk = CardService.newTextButton()
    .setText('Wybierz')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('wybierzZListy'));

  return CardService.newCardSection()
    .setHeader('Lub wybierz z listy (' + projekty.length + ')')
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(0)
    .addWidget(lista)
    .addWidget(przycisk);
}

function budujKarteBledu_(komunikat) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Zadanie projektowe'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(komunikat)))
    .build();
}

function wybierzZWynikow(e) {
  const kod = (e.parameters && e.parameters.kod) || '';
  const nazwa = (e.parameters && e.parameters.nazwa) || '';
  return otworzProjekt_(kod, nazwa);
}

function wybierzZListy(e) {
  const wartosc = tekstZFormularza_(e, 'zListy');

  // Rozdzielamy po PIERWSZYM „|” – nazwa teoretycznie może zawierać „|”.
  const kreska = wartosc.indexOf('|');
  const kod = kreska === -1 ? wartosc : wartosc.substring(0, kreska);
  const nazwa = kreska === -1 ? '' : wartosc.substring(kreska + 1);

  return otworzProjekt_(kod, nazwa);
}

/**
 * Zanim cokolwiek pokażemy, sprawdzamy, czy dla wybranego kodu istnieje
 * lista zadań. Lepiej powiedzieć o tym od razu niż po wypełnieniu formularza.
 */
function otworzProjekt_(kod, nazwa) {

  if (!kod) return powiadomienie_('Nie wybrano projektu.');

  const lista = znajdzListeZadan_(kod);
  const karta = lista.blad
    ? kartaBrakuListy_(kod, nazwa, lista)
    : kartaProjektu_(kod, nazwa, lista, '');

  return nawigacja_(CardService.newNavigation().pushCard(karta));
}


// ============================================================
// 3. KARTA PROJEKTU – nowe zadanie + lista istniejących
// ============================================================

function kartaProjektu_(kod, nazwa, lista, fraza) {

  const p = parametryProjektu_(kod, nazwa, lista);

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(kod)
      .setSubtitle(nazwa || 'Zadania projektu'));

  karta.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextButton()
      .setText('➕ Nowe zadanie')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(akcja_('noweZadanieWProjekcie', p)))
    .addWidget(CardService.newDecoratedText()
      .setTopLabel('Lista zadań')
      .setText(lista.nazwa)
      .setWrapText(true)
      .setOpenLink(CardService.newOpenLink().setUrl(lista.url)))
    .addWidget(CardService.newTextButton()
      .setText('Zmień projekt')
      .setOnClickAction(CardService.newAction().setFunctionName('innyProjekt'))));

  let zadania;
  try {
    zadania = wczytajZadania_(lista.id);
  } catch (err) {
    karta.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#d93025">Nie udało się odczytać listy zadań: '
               + escapeHtml_(err.message) + '</font>')));
    return karta.build();
  }

  karta.addSection(CardService.newCardSection()
    .addWidget(CardService.newTextInput()
      .setFieldName('frazaZadan')
      .setTitle('Szukaj zadania')
      .setHint('temat, opis, osoba lub status')
      .setValue(fraza || '')
      .setOnChangeAction(akcja_('szukajZadan', p))));

  const podzial = podzielZadania_(filtrujZadania_(zadania, fraza));

  karta.addSection(sekcjaZadan_('Aktywne (' + podzial.aktywne.length + ')',
                                podzial.aktywne, p, false,
                                zadania.length === 0 ? 'Na liście nie ma jeszcze żadnych zadań.' : 'Brak aktywnych zadań.'));

  if (podzial.zamkniete.length > 0) {
    karta.addSection(sekcjaZadan_('Ukończone i anulowane (' + podzial.zamkniete.length + ')',
                                  podzial.zamkniete, p, true, ''));
  }

  return karta.build();
}

function sekcjaZadan_(naglowek, zadania, p, zwinieta, gdyPusto) {

  const sekcja = CardService.newCardSection().setHeader(naglowek);

  if (zwinieta) {
    sekcja.setCollapsible(true).setNumUncollapsibleWidgets(0);
  }

  if (zadania.length === 0) {
    sekcja.addWidget(CardService.newTextParagraph()
      .setText('<font color="#888">' + gdyPusto + '</font>'));
    return sekcja;
  }

  zadania.slice(0, CONFIG.MAX_ZADAN_NA_LISCIE).forEach(function (z) {
    sekcja.addWidget(widgetZadania_(z, p));
  });

  if (zadania.length > CONFIG.MAX_ZADAN_NA_LISCIE) {
    sekcja.addWidget(CardService.newTextParagraph()
      .setText('<font color="#888">Pokazano ' + CONFIG.MAX_ZADAN_NA_LISCIE + ' z '
             + zadania.length + '. Resztę znajdziesz wyszukiwarką.</font>'));
  }

  return sekcja;
}

function widgetZadania_(z, p) {

  const termin = opisTerminu_(z.od, z.do);

  const w = CardService.newDecoratedText()
    .setTopLabel((z.status || CONFIG.STATUS_POCZATKOWY) + (z.email ? ' · ' + z.email : ''))
    .setText(z.temat)
    .setWrapText(true);

  if (z.id) {
    w.setBottomLabel(termin || 'bez terminu');
    w.setOnClickAction(akcja_('otworzEdycje', Object.assign({}, p, { id: String(z.id) })));
  } else {
    // Bez identyfikatora nie da się bezpiecznie odnaleźć tego wiersza przy
    // zapisie. Identyfikator nada synchronizacja w ciągu kilkunastu minut.
    w.setBottomLabel((termin ? termin + ' · ' : '') + 'czeka na synchronizację – edycja za kilka minut');
  }

  return w;
}

function szukajZadan(e) {
  const pr = projektZParametrow_(e.parameters);
  return nawigacja_(CardService.newNavigation()
    .updateCard(kartaProjektu_(pr.kod, pr.nazwa, pr.lista, tekstZFormularza_(e, 'frazaZadan'))));
}

function noweZadanieWProjekcie(e) {
  const pr = projektZParametrow_(e.parameters);
  return nawigacja_(CardService.newNavigation()
    .pushCard(kartaFormularza_(pr.kod, pr.nazwa, pr.lista, {}, '')));
}

// Powrót na kartę projektu Z ODŚWIEŻENIEM listy – po zapisie lista na
// karcie pod spodem jest nieaktualna, więc od razu rysujemy ją od nowa.
function wrocDoProjektu(e) {
  const pr = projektZParametrow_(e.parameters);
  return nawigacja_(CardService.newNavigation()
    .popCard()
    .updateCard(kartaProjektu_(pr.kod, pr.nazwa, pr.lista, '')));
}

// Zwykły powrót o jedną kartę, bez zapisu.
function wroc() {
  return nawigacja_(CardService.newNavigation().popCard());
}

function innyProjekt() {
  return nawigacja_(CardService.newNavigation().popToRoot().updateCard(budujKarte_('')));
}

// Nazwa z wersji 1 – zostawiona, żeby karty otwarte przed aktualizacją
// nie kończyły się błędem po kliknięciu.
function noweZadanie() { return innyProjekt(); }
function wrocDoListy() { return innyProjekt(); }

function kartaBrakuListy_(kod, nazwa, lista) {

  let tresc;
  if (lista.blad === 'wiele') {
    tresc = 'Dla projektu <b>' + escapeHtml_(kod) + '</b> znaleziono kilka list zadań:<br>'
          + lista.pliki.map(function (p) { return '• ' + escapeHtml_(p.nazwa); }).join('<br>')
          + '<br><br>Dodatek nie wie, do której zapisać zadanie. Zostaw znak '
          + CONFIG.ZNACZNIK_PLIKU + ' na początku nazwy tylko jednej z nich.';
  } else {
    tresc = 'Projekt <b>' + escapeHtml_(kod) + '</b>' + (nazwa ? ' (' + escapeHtml_(nazwa) + ')' : '')
          + ' nie ma jeszcze listy zadań.<br><br>'
          + 'Aby dodać do niego zadanie, w folderze projektu musi istnieć arkusz, '
          + 'którego nazwa zaczyna się od <b>' + CONFIG.ZNACZNIK_PLIKU + escapeHtml_(kod) + '</b>, '
          + 'np. „' + CONFIG.ZNACZNIK_PLIKU + escapeHtml_(kod) + ' Zadania”.';
  }

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Brak listy zadań'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph().setText(tresc))
      .addWidget(CardService.newTextButton()
        .setText('Wróć')
        .setOnClickAction(CardService.newAction().setFunctionName('innyProjekt'))))
    .build();
}


// ============================================================
// 4. NOWE ZADANIE
// ============================================================

/**
 * @param w  wartości pól do ponownego wypełnienia – po błędzie walidacji
 *           formularz rysuje się od nowa i bez tego wszystko by zniknęło
 */
function kartaFormularza_(kod, nazwa, lista, w, komunikat) {

  const dzis = dzisMs_();

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Nowe zadanie')
      .setSubtitle(kod + (nazwa ? ' – ' + nazwa : '')));

  const sekcja = CardService.newCardSection();

  if (komunikat) sekcja.addWidget(komunikatBledu_(komunikat));

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('temat').setTitle('Temat *').setValue(w.temat || ''));

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('opis').setTitle('Opis').setMultiline(true).setValue(w.opis || ''));

  // Przy pierwszym otwarciu podpowiadamy własny adres. Po błędzie
  // walidacji zostawiamy to, co ktoś wpisał – także puste pole.
  const email = (w.email !== undefined)
    ? w.email
    : (CONFIG.PODPOWIADAJ_MOJ_EMAIL ? biezacyEmail_() : '');

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('email').setTitle('Osoba (e-mail)')
    .setHint('puste = zadanie bez przypisanej osoby').setValue(email));

  sekcja.addWidget(CardService.newDatePicker()
    .setFieldName('dataOd').setTitle('Data od *').setValueInMsSinceEpoch(w.dataOdMs || dzis));

  sekcja.addWidget(CardService.newDatePicker()
    .setFieldName('dataDo').setTitle('Data do *').setValueInMsSinceEpoch(w.dataDoMs || dzis));

  const p = parametryProjektu_(kod, nazwa, lista);

  sekcja.addWidget(CardService.newButtonSet()
    .addButton(CardService.newTextButton()
      .setText('Utwórz zadanie')
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setOnClickAction(akcja_('utworzZadanie', p)))
    .addButton(CardService.newTextButton()
      .setText('Wróć')
      .setOnClickAction(CardService.newAction().setFunctionName('wroc'))));

  karta.addSection(sekcja);
  return karta.build();
}

function utworzZadanie(e) {

  const pr = projektZParametrow_(e.parameters);

  const w = {
    temat:    tekstZFormularza_(e, 'temat'),
    opis:     tekstZFormularza_(e, 'opis'),
    email:    tekstZFormularza_(e, 'email'),
    dataOdMs: dataZFormularza_(e, 'dataOd'),
    dataDoMs: dataZFormularza_(e, 'dataDo'),
  };

  const blad = sprawdzFormularz_(w);
  if (blad) {
    return nawigacja_(CardService.newNavigation()
      .updateCard(kartaFormularza_(pr.kod, pr.nazwa, pr.lista, w, blad)));
  }

  let wynik;
  try {
    wynik = dopiszZadanie_(pr.lista.id, w);
  } catch (err) {
    console.error('Zapis nieudany: ' + err.message);
    return nawigacja_(CardService.newNavigation()
      .updateCard(kartaFormularza_(pr.kod, pr.nazwa, pr.lista, w,
        'Nie udało się zapisać zadania: ' + err.message)));
  }

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(kartaPotwierdzenia_(pr, w, wynik)))
    .setNotification(CardService.newNotification().setText('Zadanie dodane do listy ' + pr.kod))
    .build();
}

/**
 * Dopisuje wiersz A–G w tym samym miejscu, w które wstawia zadania
 * synchronizacja: pierwsza CAŁKOWICIE pusta dziura wewnątrz tabeli,
 * a gdy jej nie ma – NOWY wiersz wstawiony pod ostatnim zadaniem.
 * Wstawienie (zamiast pisania gdzieś niżej) sprawia, że wiersz dziedziczy
 * formatowanie tabeli i listę wyboru w kolumnie Status.
 *
 * Blokada: dwie osoby klikające w tej samej chwili mogłyby trafić w ten
 * sam wiersz. Blokada skryptu jest wspólna dla wszystkich użytkowników
 * dodatku, więc zapisy idą po kolei.
 */
function dopiszZadanie_(plikId, w) {

  const blokada = LockService.getScriptLock();
  blokada.waitLock(20000);

  try {
    const arkusz = otworzArkuszZadan_(plikId);
    const miejsce = miejsceNaZadanie_(arkusz);

    arkusz.getRange(miejsce.wiersz, KOL.dataOd, 1, 2).setNumberFormat('yyyy-mm-dd');
    arkusz.getRange(miejsce.wiersz, 1, 1, KOL.notatki).setValues([[
      w.temat,
      w.opis,
      w.email,
      dataTekst_(w.dataOdMs),     // tekst RRRR-MM-DD – Arkusz sam zamienia go na datę,
      dataTekst_(w.dataDoMs),     // a synchronizacja i tak ujednolica format dat
      CONFIG.STATUS_POCZATKOWY,
      '',                         // Notatki – puste na start
    ]]);
    SpreadsheetApp.flush();

    return { wiersz: miejsce.wiersz };

  } finally {
    blokada.releaseLock();
  }
}

function kartaPotwierdzenia_(pr, w, wynik) {

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('✅ Zadanie dodane'))
    .addSection(CardService.newCardSection()
      .addWidget(pole_('Projekt', pr.kod, pr.nazwa))
      .addWidget(pole_('Temat', w.temat))
      .addWidget(pole_('Termin', opisTerminu_(dataTekst_(w.dataOdMs), dataTekst_(w.dataDoMs))))
      .addWidget(pole_('Osoba', w.email || '(bez przypisania)'))
      .addWidget(CardService.newDecoratedText()
        .setTopLabel('Zapisano w').setText(pr.lista.nazwa)
        .setBottomLabel('wiersz ' + wynik.wiersz).setWrapText(true)
        .setOpenLink(CardService.newOpenLink().setUrl(pr.lista.url)))
      .addWidget(CardService.newTextParagraph()
        .setText('<font color="#5f6368">Wydarzenie pojawi się w kalendarzu „Zadania projektowe” '
               + 'po najbliższej synchronizacji.</font>')))
    .addSection(przyciskiPoZapisie_(pr))
    .build();
}


// ============================================================
// 5. EDYCJA ISTNIEJĄCEGO ZADANIA
// ============================================================

function otworzEdycje(e) {

  const pr = projektZParametrow_(e.parameters);
  const id = (e.parameters && e.parameters.id) || '';

  // Zadanie czytamy ŚWIEŻO z pliku, a nie z listy na karcie projektu –
  // lista mogła być otwarta od dłuższego czasu.
  let z;
  try {
    z = wczytajZadanie_(pr.lista.id, id);
  } catch (err) {
    return powiadomienie_('Nie udało się odczytać zadania: ' + err.message);
  }

  return nawigacja_(CardService.newNavigation()
    .pushCard(kartaEdycji_(pr, z, null, odciskZadania_(z), '')));
}

/**
 * @param z        zadanie w wersji z pliku (do wypełnienia pól i pokazania notatek)
 * @param w        wartości wpisane przez użytkownika – po błędzie walidacji;
 *                 null = wypełnij polami z z
 * @param odcisk   „odcisk palca” zadania z chwili OTWARCIA formularza –
 *                 przy zapisie po nim poznamy, czy ktoś zmienił zadanie w międzyczasie
 */
function kartaEdycji_(pr, z, w, odcisk, komunikat) {

  const v = w || {
    temat: z.temat, opis: z.opis, email: z.email,
    dataOdMs: msZDaty_(z.od), dataDoMs: msZDaty_(z.do),
    status: z.status, nowaNotatka: '',
  };

  const karta = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Edycja zadania')
      .setSubtitle(pr.kod + (pr.nazwa ? ' – ' + pr.nazwa : '')));

  const sekcja = CardService.newCardSection();

  if (komunikat) sekcja.addWidget(komunikatBledu_(komunikat));

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('temat').setTitle('Temat *').setValue(v.temat || ''));

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('opis').setTitle('Opis').setMultiline(true).setValue(v.opis || ''));

  sekcja.addWidget(CardService.newTextInput()
    .setFieldName('email').setTitle('Osoba (e-mail)')
    .setHint('puste = zadanie bez przypisanej osoby').setValue(v.email || ''));

  // Zadanie bez dat (np. źle wpisanych w pliku) pokazuje puste pole –
  // trzeba je uzupełnić, żeby zapisać, bo synchronizacja i tak pominęłaby
  // zadanie bez poprawnych dat.
  const dataOd = CardService.newDatePicker().setFieldName('dataOd').setTitle('Data od *');
  if (v.dataOdMs) dataOd.setValueInMsSinceEpoch(v.dataOdMs);
  sekcja.addWidget(dataOd);

  const dataDo = CardService.newDatePicker().setFieldName('dataDo').setTitle('Data do *');
  if (v.dataDoMs) dataDo.setValueInMsSinceEpoch(v.dataDoMs);
  sekcja.addWidget(dataDo);

  const status = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('status')
    .setTitle('Status');
  statusyDoWyboru_(v.status).forEach(function (s) {
    status.addItem(s.etykieta, s.wartosc, s.wybrany);
  });
  sekcja.addWidget(status);
  sekcja.addWidget(CardService.newTextParagraph()
    .setText('<font color="#5f6368">„Anulowane” usuwa wydarzenie z kalendarza. '
           + '„Ukończone” zostawia je z ✅.</font>'));

  karta.addSection(sekcja);

  // Notatki: dotychczasowe tylko do odczytu, nowa jest DOPISYWANA z datą.
  // Nie dajemy edytować całej historii – żeby nikt przez pomyłkę nie skasował
  // cudzych notatek (także tych, które przyszły z kalendarza).
  karta.addSection(CardService.newCardSection()
    .setHeader('Notatki')
    .addWidget(CardService.newTextParagraph()
      .setText(z.notatki
        ? escapeHtml_(z.notatki).replace(/\n/g, '<br>')
        : '<font color="#888">(brak notatek)</font>'))
    .addWidget(CardService.newTextInput()
      .setFieldName('nowaNotatka')
      .setTitle('Dodaj notatkę')
      .setHint('zostanie dopisana pod poprzednimi, z dzisiejszą datą')
      .setMultiline(true)
      .setValue(v.nowaNotatka || '')));

  const p = Object.assign(parametryProjektu_(pr.kod, pr.nazwa, pr.lista),
                          { id: String(z.id), odcisk: String(odcisk) });

  karta.addSection(CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Zapisz zmiany')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(akcja_('zapiszZmiany', p)))
      .addButton(CardService.newTextButton()
        .setText('Wróć')
        .setOnClickAction(CardService.newAction().setFunctionName('wroc'))))
    .addWidget(CardService.newDecoratedText()
      .setTopLabel('Zadanie ' + z.id)
      .setText(pr.lista.nazwa)
      .setBottomLabel('wiersz ' + z.wiersz)
      .setWrapText(true)
      .setOpenLink(CardService.newOpenLink().setUrl(pr.lista.url))));

  return karta.build();
}

function zapiszZmiany(e) {

  const p = e.parameters || {};
  const pr = projektZParametrow_(p);

  const w = {
    temat:       tekstZFormularza_(e, 'temat'),
    opis:        tekstZFormularza_(e, 'opis'),
    email:       tekstZFormularza_(e, 'email'),
    dataOdMs:    dataZFormularza_(e, 'dataOd'),
    dataDoMs:    dataZFormularza_(e, 'dataDo'),
    status:      tekstZFormularza_(e, 'status'),
    nowaNotatka: tekstZFormularza_(e, 'nowaNotatka'),
  };

  const blad = sprawdzFormularz_(w);
  if (blad) return odswiezEdycje_(pr, p.id, p.odcisk, w, blad);

  let wynik;
  try {
    wynik = zapiszZadanie_(pr.lista.id, p.id, p.odcisk, w);
  } catch (err) {
    console.error('Zapis edycji nieudany: ' + err.message);
    return odswiezEdycje_(pr, p.id, p.odcisk, w, 'Nie udało się zapisać: ' + err.message);
  }

  if (wynik.konflikt) {
    // Pokazujemy AKTUALNĄ wersję z pliku z nowym odciskiem. Wpisaną notatkę
    // zostawiamy w polu – notatki się tylko dopisuje, więc tu konfliktu nie ma.
    const aktualne = wynik.aktualne;
    const v = {
      temat: aktualne.temat, opis: aktualne.opis, email: aktualne.email,
      dataOdMs: msZDaty_(aktualne.od), dataDoMs: msZDaty_(aktualne.do),
      status: aktualne.status, nowaNotatka: w.nowaNotatka,
    };
    return nawigacja_(CardService.newNavigation()
      .updateCard(kartaEdycji_(pr, aktualne, v, odciskZadania_(aktualne),
        'W międzyczasie ktoś inny zmienił to zadanie – niczego nie nadpisano. '
        + 'Poniżej jest jego aktualna wersja. Wprowadź swoje zmiany jeszcze raz i zapisz.')));
  }

  const nic = !wynik.zmienionePola && !wynik.dopisanoNotatke;

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(kartaZapisano_(pr, w, wynik)))
    .setNotification(CardService.newNotification()
      .setText(nic ? 'Nie wprowadzono żadnych zmian' : 'Zapisano zmiany w zadaniu'))
    .build();
}

function odswiezEdycje_(pr, id, odcisk, w, komunikat) {
  // Notatki pokazujemy z pliku, więc wczytujemy zadanie jeszcze raz.
  // Odcisk zostaje ORYGINALNY – z chwili otwarcia formularza.
  let z;
  try { z = wczytajZadanie_(pr.lista.id, id); }
  catch (err) { return powiadomienie_(komunikat + ' (' + err.message + ')'); }
  return nawigacja_(CardService.newNavigation()
    .updateCard(kartaEdycji_(pr, z, w, odcisk, komunikat)));
}

/**
 * Zapis edycji. Kolejność ma znaczenie:
 *   1. Odnajdujemy wiersz PO IDENTYFIKATORZE (kolumna H).
 *   2. Jeśli użytkownik zmienił którekolwiek z pól A–F, sprawdzamy, czy
 *      zadanie w pliku jest wciąż takie, jak w chwili otwarcia formularza.
 *      Jeśli nie – nic nie zapisujemy (konflikt).
 *   3. Notatkę dopisujemy zawsze, bo dopisanie niczego nie niszczy.
 *
 * Jeśli ktoś tylko dopisał notatkę, a pól nie ruszał, sprawdzenia konfliktu
 * w ogóle nie robimy – cudza zmiana tematu czy daty nie powinna blokować
 * dopisania notatki.
 */
function zapiszZadanie_(plikId, id, odciskWczytany, w) {

  const blokada = LockService.getScriptLock();
  blokada.waitLock(20000);

  try {
    const arkusz = otworzArkuszZadan_(plikId);
    const strefa = arkusz.getParent().getSpreadsheetTimeZone();
    const wiersz = znajdzWierszPoId_(arkusz, id);

    const zFormularza = {
      temat: w.temat, opis: w.opis, email: w.email,
      od: dataTekst_(w.dataOdMs), do: dataTekst_(w.dataDoMs), status: w.status,
    };
    const zmienionePola = odciskZadania_(zFormularza) !== odciskWczytany;

    if (zmienionePola) {
      const obecne = zadanieZWiersza_(
        arkusz.getRange(wiersz, 1, 1, KOL.idSystemowe).getValues()[0], wiersz, strefa);

      if (odciskZadania_(obecne) !== odciskWczytany) {
        return { konflikt: true, aktualne: obecne };
      }

      arkusz.getRange(wiersz, KOL.dataOd, 1, 2).setNumberFormat('yyyy-mm-dd');
      arkusz.getRange(wiersz, 1, 1, KOL.status).setValues([[
        w.temat, w.opis, w.email, zFormularza.od, zFormularza.do, w.status,
      ]]);
    }

    let dopisanoNotatke = false;
    if (w.nowaNotatka) {
      const komorka = arkusz.getRange(wiersz, KOL.notatki);
      const znacznik = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd HH:mm');
      komorka.setValue(dopiszNotatke_(komorka.getValue(), w.nowaNotatka, znacznik));
      dopisanoNotatke = true;
    }

    SpreadsheetApp.flush();
    return { wiersz: wiersz, zmienionePola: zmienionePola, dopisanoNotatke: dopisanoNotatke };

  } finally {
    blokada.releaseLock();
  }
}

function kartaZapisano_(pr, w, wynik) {

  const nic = !wynik.zmienionePola && !wynik.dopisanoNotatke;

  const sekcja = CardService.newCardSection()
    .addWidget(pole_('Temat', w.temat))
    .addWidget(pole_('Status', w.status))
    .addWidget(pole_('Termin', opisTerminu_(dataTekst_(w.dataOdMs), dataTekst_(w.dataDoMs))))
    .addWidget(pole_('Osoba', w.email || '(bez przypisania)'));

  if (wynik.dopisanoNotatke) sekcja.addWidget(pole_('Dodana notatka', w.nowaNotatka));

  let info;
  if (nic) {
    info = 'Nic się nie zmieniło, więc niczego nie zapisano.';
  } else if (String(w.status).toLowerCase() === 'anulowane') {
    info = 'Status „Anulowane” – przy najbliższej synchronizacji wydarzenie zostanie usunięte z kalendarza.';
  } else {
    info = 'Wydarzenie w kalendarzu zaktualizuje się przy najbliższej synchronizacji.';
  }
  sekcja.addWidget(CardService.newTextParagraph().setText('<font color="#5f6368">' + info + '</font>'));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle(nic ? 'Brak zmian' : '✅ Zapisano zmiany'))
    .addSection(sekcja)
    .addSection(przyciskiPoZapisie_(pr))
    .build();
}

function przyciskiPoZapisie_(pr) {
  return CardService.newCardSection()
    .addWidget(CardService.newButtonSet()
      .addButton(CardService.newTextButton()
        .setText('Wróć do zadań projektu')
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(akcja_('wrocDoProjektu', parametryProjektu_(pr.kod, pr.nazwa, pr.lista))))
      .addButton(CardService.newTextButton()
        .setText('Inny projekt')
        .setOnClickAction(CardService.newAction().setFunctionName('innyProjekt'))));
}


// ============================================================
// 6. ODCZYT LISTY ZADAŃ Z PLIKU
// ============================================================

function otworzArkuszZadan_(plikId) {
  let ss;
  try { ss = SpreadsheetApp.openById(plikId); }
  catch (err) { throw new Error('brak dostępu do listy zadań (' + err.message + ')'); }

  const arkusz = znajdzArkuszZadan_(ss);
  if (!arkusz) throw new Error('w pliku nie ma karty z nagłówkiem „Temat” w komórce A1');
  return arkusz;
}

function wczytajZadania_(plikId) {
  const arkusz = otworzArkuszZadan_(plikId);
  const strefa = arkusz.getParent().getSpreadsheetTimeZone();
  const koniec = ostatniWierszZadania_(arkusz);
  if (koniec < 2) return [];

  const dane = arkusz.getRange(2, 1, koniec - 1, KOL.idSystemowe).getValues();
  const zadania = [];
  for (let i = 0; i < dane.length; i++) {
    const z = zadanieZWiersza_(dane[i], i + 2, strefa);
    if (z) zadania.push(z);
  }
  return zadania;
}

function wczytajZadanie_(plikId, id) {
  const arkusz = otworzArkuszZadan_(plikId);
  const strefa = arkusz.getParent().getSpreadsheetTimeZone();
  const wiersz = znajdzWierszPoId_(arkusz, id);
  return zadanieZWiersza_(arkusz.getRange(wiersz, 1, 1, KOL.idSystemowe).getValues()[0], wiersz, strefa);
}

/**
 * Numer wiersza z danym identyfikatorem w kolumnie H. Odmawia, gdy
 * identyfikatora nie ma albo występuje kilka razy (skopiowany wiersz) –
 * w obu przypadkach zapis mógłby trafić w złe zadanie.
 */
function znajdzWierszPoId_(arkusz, id) {
  const szukany = String(id || '').trim();
  if (!szukany) throw new Error('zadanie nie ma jeszcze identyfikatora – poczekaj na synchronizację');

  const ostatni = arkusz.getLastRow();
  const kolumna = ostatni >= 2 ? arkusz.getRange(2, KOL.idSystemowe, ostatni - 1, 1).getValues() : [];
  const trafienia = [];
  for (let i = 0; i < kolumna.length; i++) {
    if (String(kolumna[i][0] || '').trim() === szukany) trafienia.push(i + 2);
  }

  if (trafienia.length === 0) throw new Error('nie znaleziono zadania ' + szukany + ' – mogło zostać usunięte z listy');
  if (trafienia.length > 1) throw new Error('identyfikator ' + szukany + ' występuje w kilku wierszach (' + trafienia.join(', ') + ') – popraw to w pliku');
  return trafienia[0];
}

/** Wiersz arkusza (kolumny A–H) → obiekt zadania, albo null dla wiersza bez tematu. */
function zadanieZWiersza_(r, wiersz, strefa) {
  const temat = tekst_(r[KOL.temat - 1]);
  if (!temat) return null;
  return {
    wiersz:  wiersz,
    temat:   temat,
    opis:    tekst_(r[KOL.opis - 1]),
    email:   tekst_(r[KOL.email - 1]),
    od:      dataZKomorki_(r[KOL.dataOd - 1], strefa),
    do:      dataZKomorki_(r[KOL.dataDo - 1], strefa),
    status:  tekst_(r[KOL.status - 1]),
    notatki: tekst_(r[KOL.notatki - 1]),
    id:      tekst_(r[KOL.idSystemowe - 1]),
  };
}

/**
 * „Odcisk palca” zadania: skrót z pól, które da się zmienić w formularzu
 * (A–F). Notatek w nim nie ma – synchronizacja dopisuje do nich notatki
 * z kalendarza i nie powinno to blokować zapisu edycji.
 */
function odciskZadania_(z) {
  const tekst = JSON.stringify([z.temat, z.opis, z.email, z.od, z.do, z.status]
    .map(function (v) { return tekst_(v); }));
  const bajty = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, tekst, Utilities.Charset.UTF_8);
  return bajty.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function dopiszNotatke_(poprzednie, tekst, znacznik) {
  const stare = tekst_(poprzednie);
  const nowa = '[' + znacznik + '] ' + tekst_(tekst);
  return stare ? stare + '\n' + nowa : nowa;
}

/** Lista statusów do wyboru. Nietypowy status z pliku zostaje na liście, żeby go po cichu nie zmienić. */
function statusyDoWyboru_(obecny) {
  const biezacy = tekst_(obecny) || CONFIG.STATUS_POCZATKOWY;
  const lista = CONFIG.LISTA_STATUSOW.slice();
  const naLiscie = lista.some(function (s) { return s.toLowerCase() === biezacy.toLowerCase(); });
  if (!naLiscie) lista.unshift(biezacy);
  return lista.map(function (s) {
    return { etykieta: s, wartosc: s, wybrany: s.toLowerCase() === biezacy.toLowerCase() };
  });
}

function podzielZadania_(zadania) {
  const zamkniete = ['ukończone', 'ukonczone', 'zakończone', 'zakonczone', 'anulowane'];
  const wynik = { aktywne: [], zamkniete: [] };
  zadania.forEach(function (z) {
    (zamkniete.indexOf(String(z.status).toLowerCase()) !== -1 ? wynik.zamkniete : wynik.aktywne).push(z);
  });
  return wynik;
}

function filtrujZadania_(zadania, fraza) {
  const tekst = tekst_(fraza).toLowerCase();
  if (!tekst) return zadania;
  const slowa = tekst.split(/\s+/);
  return zadania.filter(function (z) {
    const gdzie = (z.temat + ' ' + z.opis + ' ' + z.email + ' ' + z.status).toLowerCase();
    return slowa.every(function (s) { return gdzie.indexOf(s) !== -1; });
  });
}


// ============================================================
// 7. SZUKANIE LISTY ZADAŃ DLA KODU
// ============================================================

/**
 * Zwraca { id, nazwa, url } albo { blad: 'brak' } / { blad: 'wiele', pliki }.
 *
 * Najpierw patrzymy w pamięć podręczną. Jeśli kodu tam nie ma, NIE
 * przyjmujemy od razu, że listy nie ma – ktoś mógł ją założyć przed
 * chwilą. Wtedy przeszukujemy folder od nowa i dopiero to jest odpowiedź.
 */
function znajdzListeZadan_(kod) {
  const k = String(kod || '').trim().toUpperCase();

  let mapa = mapaListZadan_(false);
  if (!mapa[k]) mapa = mapaListZadan_(true);

  const trafienia = mapa[k] || [];
  if (trafienia.length === 0) return { blad: 'brak' };
  if (trafienia.length > 1) return { blad: 'wiele', pliki: trafienia };
  return trafienia[0];
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
      if (!mapa[kod]) mapa[kod] = [];
      mapa[kod].push({ id: f.getId(), nazwa: f.getName(), url: f.getUrl() });
    }
  }

  try {
    cache.put(KLUCZ_CACHE_PLIKOW, JSON.stringify(mapa), CONFIG.CZAS_CACHE_PLIKOW);
  } catch (blad) {
    console.warn('Nie udało się zapisać mapy list do cache: ' + blad.message);
  }

  return mapa;
}

/**
 * „#PRJ001 Zadania – Nazwa”     → „PRJ001”
 * „#ABC017_X Lista”              → „ABC017_X”
 * „#Zadania – Nazwa”           → null (brak kodu – nie ma w nim cyfry)
 * „Kopia pliku #PRJ001 …”        → null (# nie jest pierwszym znakiem)
 *
 * Kod kończy się na pierwszym znaku, który nie jest literą, cyfrą ani „_”.
 * Dlatego po kodzie w nazwie pliku musi być spacja (albo myślnik).
 */
function kodZNazwyPliku_(nazwa) {
  const s = String(nazwa || '');
  if (s.charAt(0) !== CONFIG.ZNACZNIK_PLIKU) return null;

  const m = s.substring(1).match(/^\s*([A-Za-z0-9_]+)/);
  if (!m) return null;

  const kod = m[1].toUpperCase();
  return /[0-9]/.test(kod) ? kod : null;
}


// ============================================================
// 8. MIEJSCE NA NOWE ZADANIE – ta sama logika co w synchronizacji
// ============================================================

function znajdzArkuszZadan_(ss) {
  const arkusze = ss.getSheets();
  for (let i = 0; i < arkusze.length; i++) {
    const a1 = String(arkusze[i].getRange(1, 1).getValue() || '').trim().toLowerCase();
    if (a1 === NAGLOWEK_KARTY_ZADAN) return arkusze[i];
  }
  return null;
}

// Ostatni wiersz, w którym stoi TEMAT – faktyczny koniec tabeli zadań.
function ostatniWierszZadania_(arkusz) {
  const ostatni = arkusz.getLastRow();
  if (ostatni < 2) return 1;
  const kolumna = arkusz.getRange(2, KOL.temat, ostatni - 1, 1).getValues();
  for (let i = kolumna.length - 1; i >= 0; i--) {
    if (String(kolumna[i][0] || '').trim() !== '') return i + 2;
  }
  return 1;
}

function miejsceNaZadanie_(arkusz) {
  const koniec = ostatniWierszZadania_(arkusz);

  if (koniec >= 2) {
    const ileKolumn = Math.min(KOL_OSTATNIA_SYSTEMOWA, arkusz.getMaxColumns());
    const zakres = arkusz.getRange(2, 1, koniec - 1, ileKolumn).getValues();
    for (let i = 0; i < zakres.length; i++) {
      const pusty = zakres[i].every(function (v) { return String(v || '').trim() === ''; });
      if (pusty) return { wiersz: i + 2 };
    }
  }

  const baza = (koniec < 2) ? 1 : koniec;
  arkusz.insertRowAfter(baza);
  return { wiersz: baza + 1 };
}


// ============================================================
// 9. POMOCNICZE
// ============================================================

function sprawdzFormularz_(w) {
  if (!w.temat) return 'Uzupełnij temat zadania.';
  if (!w.dataOdMs) return 'Wybierz datę rozpoczęcia.';
  if (!w.dataDoMs) return 'Wybierz datę zakończenia.';
  if (Number(w.dataDoMs) < Number(w.dataOdMs)) return 'Data zakończenia nie może być wcześniejsza niż data rozpoczęcia.';
  if (w.email && (w.email.indexOf('@') === -1 || /\s/.test(w.email))) {
    return 'Adres e-mail wygląda na niepoprawny: „' + w.email + '”.';
  }
  return null;
}

// Dane projektu przekazujemy między kartami w parametrach akcji –
// wszystkie muszą być tekstem.
function parametryProjektu_(kod, nazwa, lista) {
  return {
    kod: String(kod || ''),
    nazwa: String(nazwa || ''),
    plikId: String(lista.id || ''),
    plikNazwa: String(lista.nazwa || ''),
    plikUrl: String(lista.url || ''),
  };
}

function projektZParametrow_(p) {
  p = p || {};
  return {
    kod: p.kod || '',
    nazwa: p.nazwa || '',
    lista: { id: p.plikId || '', nazwa: p.plikNazwa || '', url: p.plikUrl || '' },
  };
}

function akcja_(funkcja, parametry) {
  return CardService.newAction().setFunctionName(funkcja).setParameters(parametry);
}

function nawigacja_(nav) {
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function pole_(etykieta, tekst, podpis) {
  const w = CardService.newDecoratedText().setTopLabel(etykieta).setText(tekst || '–').setWrapText(true);
  if (podpis) w.setBottomLabel(podpis);
  return w;
}

function komunikatBledu_(tekst) {
  return CardService.newTextParagraph()
    .setText('<font color="#d93025"><b>' + escapeHtml_(tekst) + '</b></font>');
}

function opisTerminu_(od, doo) {
  if (!od && !doo) return '';
  if (!doo || od === doo) return od;
  if (!od) return doo;
  return od + ' → ' + doo;
}

function tekst_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\r\n/g, '\n').trim();
}

// Odczyt pola tekstowego / listy. Najpierw nowy format zdarzenia
// (commonEventObject), awaryjnie stary (formInput).
function tekstZFormularza_(e, pole) {
  const fi = e && e.commonEventObject && e.commonEventObject.formInputs;
  if (fi && fi[pole] && fi[pole].stringInputs && fi[pole].stringInputs.value) {
    return tekst_(fi[pole].stringInputs.value[0]);
  }
  return tekst_(e && e.formInput && e.formInput[pole]);
}

// Wybrana data przychodzi jako milisekundy wskazujące PÓŁNOC CZASU UTC
// tego dnia – nie czasu polskiego. Dlatego przy zamianie na tekst
// formatujemy w UTC, inaczej data mogłaby się przesunąć o dobę.
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

// „RRRR-MM-DD” → północ UTC tego dnia (tak jak przychodzi z pola daty).
function msZDaty_(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Komórka z datą → „RRRR-MM-DD”. Datę z arkusza czytamy w strefie ARKUSZA,
// bo w niej została zapisana. Tekst przyjmujemy w dwóch spotykanych formatach.
function dataZKomorki_(v, strefa) {
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, strefa, 'yyyy-MM-dd');
  }
  const s = tekst_(v);
  const dwa = function (x) { return ('0' + x).slice(-2); };
  let m = s.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})$/);
  if (m) return m[1] + '-' + dwa(m[2]) + '-' + dwa(m[3]);
  m = s.match(/^(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4})$/);
  if (m) return m[3] + '-' + dwa(m[2]) + '-' + dwa(m[1]);
  return '';
}

// Dzisiejsza data (wg czasu polskiego) jako północ UTC – format pola daty.
function dzisMs_() {
  const t = Utilities.formatDate(new Date(), 'Europe/Warsaw', 'yyyy-MM-dd').split('-');
  return Date.UTC(Number(t[0]), Number(t[1]) - 1, Number(t[2]));
}

function biezacyEmail_() {
  try { return Session.getActiveUser().getEmail() || ''; }
  catch (e) { return ''; }
}

function powiadomienie_(tekst) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(tekst))
    .build();
}

function escapeHtml_(tekst) {
  return String(tekst || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


// ============================================================
// 10. FILTROWANIE I WCZYTANIE LISTY PROJEKTÓW
// ============================================================

function filtruj_(projekty, fraza) {

  const tekst = String(fraza || '').trim().toLowerCase();
  if (!tekst) return projekty;

  const slowa = tekst.split(/\s+/).filter(function (s) { return s.length > 0; });

  return projekty.filter(function (p) {
    const doPrzeszukania = (p.kod + ' ' + p.nazwa).toLowerCase();
    return slowa.every(function (slowo) {
      return doPrzeszukania.indexOf(slowo) !== -1;
    });
  });
}

function wczytajProjekty_() {

  const cache = CacheService.getScriptCache();
  const zapisane = cache.get(KLUCZ_CACHE);
  if (zapisane) return JSON.parse(zapisane);

  const plik = SpreadsheetApp.openById(CONFIG.ID_ARKUSZA);
  const projekty = [];
  const widzianeKody = {};

  CONFIG.ZAKLADKI.forEach(function (z) {

    const arkusz = plik.getSheetByName(z.nazwa);
    if (!arkusz) {
      console.warn('Nie znaleziono zakładki "' + z.nazwa + '" — pomijam.');
      return;
    }

    const ostatniWiersz = arkusz.getLastRow();
    if (ostatniWiersz < z.wierszDanych) {
      console.warn('Zakładka ' + z.nazwa + ' jest pusta — pomijam.');
      return;
    }

    const ostatniaKolumna = Math.max(z.kolKod, z.kolNazwa, z.kolFiltr);
    const dane = arkusz.getRange(
      z.wierszDanych, 1,
      ostatniWiersz - z.wierszDanych + 1,
      ostatniaKolumna
    ).getValues();

    const zTejZakladki = [];

    for (let i = 0; i < dane.length; i++) {
      const kod = String(dane[i][z.kolKod - 1] || '').trim().toUpperCase();
      const nazwa = String(dane[i][z.kolNazwa - 1] || '').trim().replace(/_/g, ' ');
      const filtr = String(dane[i][z.kolFiltr - 1] || '').trim().toLowerCase();

      if (!kod) continue;
      if (!/[0-9]/.test(kod)) continue;
      if (filtr.indexOf('dubel') !== -1) continue;
      if (filtr.indexOf('nieaktywn') !== -1) continue;

      if (z.dozwolone.length > 0) {
        const pasuje = z.dozwolone.some(function (d) { return filtr.indexOf(d) !== -1; });
        if (!pasuje) continue;
      }

      if (widzianeKody[kod]) continue;
      widzianeKody[kod] = true;

      zTejZakladki.push({ kod: kod, nazwa: nazwa, grupa: z.grupa });
    }

    if (CONFIG.ODWROC_KOLEJNOSC) zTejZakladki.reverse();
    Array.prototype.push.apply(projekty, zTejZakladki);
  });

  try {
    cache.put(KLUCZ_CACHE, JSON.stringify(projekty), CONFIG.CZAS_CACHE);
  } catch (blad) {
    console.warn('Nie udało się zapisać do cache: ' + blad.message);
  }

  return projekty;
}


// ============================================================
// 11. FUNKCJE DO TESTÓW I OBSŁUGI W EDYTORZE
// ============================================================

/** Uruchom po zmianie słownika, żeby zobaczyć zmiany od razu. */
function wyczyscCache() {
  CacheService.getScriptCache().remove(KLUCZ_CACHE);
  CacheService.getScriptCache().remove(KLUCZ_CACHE_PLIKOW);
  console.log('Cache wyczyszczony (lista projektów i mapa list zadań).');
}

/**
 * Pokazuje, które listy zadań dodatek widzi w folderze projektów,
 * jakie kody z nich odczytał i ile zadań jest na każdej liście.
 */
function testListZadan() {
  const mapa = mapaListZadan_(true);
  const kody = Object.keys(mapa).sort();

  console.log('Znalezione listy zadań: ' + kody.length);
  kody.forEach(function (k) {
    mapa[k].forEach(function (p) {
      let ile = '?';
      try {
        const zadania = wczytajZadania_(p.id);
        const bezId = zadania.filter(function (z) { return !z.id; }).length;
        ile = zadania.length + ' zadań' + (bezId ? ' (w tym ' + bezId + ' czeka na synchronizację)' : '');
      } catch (err) { ile = 'BŁĄD odczytu: ' + err.message; }
      console.log((mapa[k].length > 1 ? '⚠ DUBEL ' : '✅ ') + k + '  ←  ' + p.nazwa + '  |  ' + ile);
    });
  });

  if (kody.length === 0) {
    console.log('Nic nie znaleziono. Sprawdź, czy nazwy plików zaczynają się od „'
              + CONFIG.ZNACZNIK_PLIKU + 'KOD ”, np. „' + CONFIG.ZNACZNIK_PLIKU + 'PRJ001 Zadania”.');
  }
}

/** Sprawdza odczyt słownika – czas, rozmiar w cache, podział na grupy. */
function testOdczytu() {
  CacheService.getScriptCache().remove(KLUCZ_CACHE);

  const start = new Date().getTime();
  const projekty = wczytajProjekty_();
  const czas = new Date().getTime() - start;

  const wgGrup = {};
  projekty.forEach(function (p) { wgGrup[p.grupa] = (wgGrup[p.grupa] || 0) + 1; });

  console.log('Czas zimnego odczytu: ' + czas + ' ms, pozycji: ' + projekty.length);
  console.log('Podział: ' + JSON.stringify(wgGrup));
  console.log('Rozmiar w cache: ' + Math.round(JSON.stringify(projekty).length / 1024 * 10) / 10 + ' KB');
}
