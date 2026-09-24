/*************************************************************
 * NOTATKI Z DATĄ – menu „📝 Notatki” w arkuszu z listą zadań
 * Zaznacz komórkę w kolumnie „Notatki” → 📝 Notatki → Dodaj notatkę.
 * Notatka dopisuje się jako nowa linia „[RRRR-MM-DD GG:MM] treść”.
 * Wklej do każdego arkusza z listą zadań – NIE do bazy centralnej
 * (oba skrypty mają własne onOpen()).
 *************************************************************/

// Nagłówek rozpoznający kartę z zadaniami – ta sama karta, po której orientuje
// się główny skrypt synchronizacji (komórka A1 = "Temat").
var NAGLOWEK_KARTY_ZADAN = "temat";
// Nagłówki kolumny, do której dopisujemy notatki – szukane w wierszu 1,
// żeby nie zależeć na sztywno od numeru kolumny. Sprawdzamy oba warianty
// nazwy, żeby działało zarówno po, jak i przed zmianą nagłówka na "Notatki".
var NAGLOWKI_KOLUMNY_NOTATEK = ["notatki", "uwagi"];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('📝 Notatki')
    .addItem('Dodaj notatkę do zaznaczonej komórki (Notatki)', 'dodajNotatkeDoUwag')
    .addToUi();
}

function dodajNotatkeDoUwag() {
  var ui = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();

  if (String(sheet.getRange(1, 1).getValue()).toLowerCase().trim() !== NAGLOWEK_KARTY_ZADAN) {
    ui.alert("Ta karta nie wygląda na kartę z zadaniami (komórka A1 powinna zawierać „Temat”). " +
             "Przełącz się na właściwą kartę i spróbuj ponownie.");
    return;
  }

  var kolNotatek = znajdzKolumneNotatek(sheet);
  if (!kolNotatek) {
    ui.alert("Nie znaleziono w wierszu 1 kolumny z nagłówkiem „Notatki” (ani „Uwagi”).");
    return;
  }

  var cell = sheet.getActiveCell();
  if (cell.getColumn() !== kolNotatek || cell.getRow() < 2) {
    ui.alert("Najpierw zaznacz jedną komórkę w kolumnie „Notatki” (w wierszu zadania), " +
             "a dopiero potem uruchom „📝 Notatki → Dodaj notatkę…”.");
    return;
  }

  var odp = ui.prompt("Nowa notatka", "Treść notatki (zostanie dopisana pod poprzednimi, z dzisiejszą datą):",
                       ui.ButtonSet.OK_CANCEL);
  if (odp.getSelectedButton() !== ui.Button.OK) return;

  var tekst = odp.getResponseText().trim();
  if (!tekst) return;

  var znacznikCzasu = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var poprzednia = String(cell.getValue() || "").trim();
  var nowaNotatka = "[" + znacznikCzasu + "] " + tekst;
  var nowaTresc = poprzednia ? (poprzednia + "\n" + nowaNotatka) : nowaNotatka;

  cell.setValue(nowaTresc);
}

function znajdzKolumneNotatek(sheet) {
  var naglowki = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var w = 0; w < NAGLOWKI_KOLUMNY_NOTATEK.length; w++) {
    for (var i = 0; i < naglowki.length; i++) {
      if (String(naglowki[i]).toLowerCase().trim() === NAGLOWKI_KOLUMNY_NOTATEK[w]) return i + 1;
    }
  }
  return 0;
}
