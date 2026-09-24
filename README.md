# Zadania projektowe – Google Apps Script

System do przydzielania zadań projektowych przez Google Sheets i Kalendarz Google.
Zadania żyją na listach w arkuszach projektów, a synchronizacja zamienia je
w wydarzenia w jednym wspólnym kalendarzu i zapraszają do nich osoby odpowiedzialne.
Dodatek w panelu bocznym Kalendarza pozwala tworzyć i edytować zadania bez otwierania arkuszy.

## Z czego się składa

| Folder | Co to jest | Gdzie się instaluje |
|---|---|---|
| `baza-centralna/` | Synchronizacja: listy zadań → baza centralna → kalendarz (w obie strony) | Skrypt powiązany z arkuszem bazy centralnej |
| `dodatek-zadanie-projektowe/` | Dodatek Kalendarza „Zadanie projektowe”: tworzenie i edycja zadań | Osobny, samodzielny projekt Apps Script |
| `notatki/` | Menu „📝 Notatki” – dopisywanie notatek z datą w kolumnie „Notatki” | Skrypt w każdym arkuszu z listą zadań |

## Jak to działa

1. Każdy projekt ma listę zadań – arkusz, którego nazwa zaczyna się od `#` i kodu projektu,
   np. `#PRJ001 Zadania – Nazwa projektu`. Plik bez `#` jest pomijany (tak też się go archiwizuje).
2. **Synchronizacja** (ręcznie z menu albo automatycznie co 15 minut) przechodzi folder projektów
   z podfolderami, tworzy i aktualizuje wydarzenia w kalendarzu oraz utrzymuje bazę centralną
   ze wszystkimi zadaniami.
3. **Dodatek** w Kalendarzu: wybór projektu ze słownika kodów projektów → lista jego zadań →
   nowe zadanie albo edycja istniejącego. Dodatek zapisuje zmiany w liście zadań projektu,
   a do kalendarza przenosi je synchronizacja. Sam kalendarza nie dotyka.
4. **Notatki** można dopisywać z trzech miejsc – z menu w arkuszu, z dodatku i z odpowiedzi na
   zaproszenie w kalendarzu („Dodaj notatkę”). Każda dopisuje się jako nowa linia z datą, żadna
   nie nadpisuje poprzednich.

### Najważniejsze zabezpieczenia

- Wydarzenia są nieedytowalne dla gości – zadanie zmienia się tylko przez listę zadań.
- Dwukierunkowe scalanie zmian z „migawką” poprzedniego stanu; przy konflikcie wygrywa plik.
- Dodatek odnajduje zadanie po identyfikatorze (kolumna H), a nie po numerze wiersza, i nie
  nadpisuje zmiany, którą ktoś inny zrobił między otwarciem formularza a zapisem.
- Sprzątanie usuniętych zadań działa tylko na projektach odczytanych w całości i ma limit
  usunięć na jeden przebieg.

## Układ listy zadań

| Kolumna | Zawartość | Kto wypełnia |
|---|---|---|
| A | Temat (nagłówek „Temat” w A1 – po nim skrypt rozpoznaje kartę) | użytkownik |
| B | Opis | użytkownik |
| C | Email osoby odpowiedzialnej | użytkownik |
| D–E | Data od, Data do (zadania całodniowe) | użytkownik |
| F | Status: Planowane / W trakcie / Oczekujące / Wstrzymane / Ukończone / Anulowane | użytkownik |
| G | Notatki | użytkownik + skrypty |
| H–M | ID zadania, ID wydarzenia, dane systemowe (ukrywane automatycznie) | synchronizacja |

Kolumny czytane są po pozycji, więc ich kolejność musi zostać taka jak wyżej.
„Anulowane” usuwa wydarzenie z kalendarza, „Ukończone” zostawia je z ✅.

## Wdrożenie

### 1. Baza centralna

1. Arkusz bazy centralnej musi mieć zakładkę z tekstem `ID Systemowe` w komórce A1.
2. Rozszerzenia → Apps Script → wklej `baza-centralna/Kod.gs`.
3. Usługi → + → **Google Calendar API** (identyfikator `Calendar`).
4. Uzupełnij `ID_KALENDARZA_FIRMOWEGO` i `ID_FOLDERU_PROJEKTOW` (patrz *Konfiguracja*).
5. Strefa czasowa arkusza i projektu Apps Script: `Europe/Warsaw`.
6. Wyzwalacze (ikona zegara) → funkcja `pelnaSynchronizacja`, czasowy, co 15 minut.
7. Najpierw „🔎 Diagnostyka” (nic nie zapisuje), potem „📥 Synchronizuj”.

### 2. Dodatek „Zadanie projektowe”

1. script.google.com → Nowy projekt.
2. Ustawienia projektu → „Pokaż plik manifestu” → wklej `appsscript.json`, potem `Kod.gs`.
3. Uzupełnij `ID_ARKUSZA` i `ID_FOLDERU_PROJEKTOW` w `CONFIG` oraz `logoUrl` w manifeście.
   Dostosuj też `CONFIG.ZAKLADKI` (nazwy zakładek, kolumny, filtry) do układu własnego słownika –
   w repozytorium jest konfiguracja przykładowa.
4. Uruchom `testListZadan` – pokazuje, jakie listy `#KOD` dodatek widzi.
5. Wdróż → Wdrożenia testowe → Zainstaluj, potem odśwież Kalendarz.
6. Inne osoby: udostępnij im projekt (rola Edytujący); każda instaluje wdrożenie testowe sama.

### 3. Notatki

W każdym arkuszu z listą zadań: Rozszerzenia → Apps Script → wklej `notatki/Kod.gs`.
Nie wklejaj go do bazy centralnej – obie wersje mają własne `onOpen()` i by się zderzyły.

## Konfiguracja

W repozytorium identyfikatory są zastąpione zaślepkami. Przed wdrożeniem wpisz prawdziwe wartości:

| Zaślepka | Plik | Skąd wziąć |
|---|---|---|
| `TU_WKLEJ_ID_KALENDARZA@group.calendar.google.com` | `baza-centralna/Kod.gs` | Ustawienia kalendarza → „Integrowanie kalendarza” → Identyfikator kalendarza |
| `TU_WKLEJ_ID_FOLDERU_PROJEKTOW` | `baza-centralna/Kod.gs`, `dodatek-zadanie-projektowe/Kod.gs` | adres folderu: `drive.google.com/drive/folders/<ID>` |
| `TU_WKLEJ_ID_ARKUSZA_SLOWNIKA` | `dodatek-zadanie-projektowe/Kod.gs` | adres arkusza-słownika z kodami projektów: `docs.google.com/spreadsheets/d/<ID>/edit` |
| `TU_WKLEJ_PUBLICZNY_ADRES_IKONY.png` | `dodatek-zadanie-projektowe/appsscript.json` | publiczny adres HTTPS obrazka ikony dodatku |

## Ograniczenia

- Dodatki Kalendarza działają tylko w przeglądarce na komputerze, nie w aplikacji mobilnej.
- Zmiana z dodatku jest od razu na liście zadań, a w kalendarzu – po najbliższej synchronizacji.
- Nowo dodane zadanie da się edytować w dodatku dopiero po pierwszej synchronizacji
  (wtedy dostaje identyfikator).
- Jeden kod projektu = jedna lista zadań z `#`.
