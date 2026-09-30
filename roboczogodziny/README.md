# Roboczogodziny

Rejestrowanie czasu pracy nad projektami z panelu bocznego Kalendarza Google.

| Folder | Co to jest | Gdzie się instaluje |
|---|---|---|
| `arkusz-zbiorczy/` | Lista pracowników, zakładanie ich arkuszy, automat co 15 min | Skrypt w arkuszu zbiorczym (Rozszerzenia → Apps Script) |
| `dodatek/` | Dodatek Kalendarza „Roboczogodziny” | Osobny, samodzielny projekt Apps Script |

## Jak to działa

- Każdy pracownik ma **własny arkusz** „Roboczogodziny – e-mail” (karta „Sloty” – jeden wiersz = jeden slot od–do,
  karta „Ustawienia” z limitem i godziną końca pracy – chroniona). Widzi go tylko on i administrator.
- **Dodatek**: trwająca praca na górze panelu z przyciskiem „⏹ Zakończ”, „▶ Rozpocznij pracę”
  (projekt → zadanie opcjonalnie), „➕ Dodaj ręcznie”, „📋 Moje sloty” (przegląd, edycja, zmiana projektu, usuwanie).
- **Pilnowane przy każdym zapisie**: sloty się nie nakładają, suma dnia ≤ limit, slot w jednym dniu, nie w przyszłości.
  „Rozpocznij” przy trwającym slocie zamyka go w tej samej minucie; nowy slot można zacząć od końca poprzedniego.
- **Automat w arkuszu zbiorczym (co 15 min)**: niezakończony slot zamyka o godzinie końca pracy albo przy limicie
  (co wcześniej; nadgodziny rozpoczęte po końcu pracy zamyka tylko limit), zbiera sloty na kartę „Wszystkie sloty”,
  liczy sumy na karcie „Dni”, problemy (np. nakładanie wpisane ręcznie) wypisuje w „RAPORT”.
- Zadania do wyboru pochodzą z list `#KOD …` w folderze projektów – tych samych, z których korzysta synchronizacja
  i dodatek „Zadanie projektowe”.

## Wdrożenie

### A. Arkusz zbiorczy
1. Utwórz folder na arkusze pracowników i w nim arkusz zbiorczy. Folderu nie udostępniaj.
2. Rozszerzenia → Apps Script → wklej `arkusz-zbiorczy/Kod.gs` (i `appsscript.json`, jeśli manifest jest widoczny).
   `ID_FOLDERU_ARKUSZY` puste = folder, w którym leży arkusz zbiorczy.
3. Ustawienia projektu: strefa `Europe/Warsaw`, środowisko V8. To samo w arkuszu: Plik → Ustawienia.
4. Menu **⏱ Roboczogodziny → 👥 Utwórz / zaktualizuj arkusze pracowników** – tworzy kartę „Pracownicy”.
5. Na karcie „Pracownicy”: e-mail, imię i nazwisko, limit (h), koniec pracy (GG:MM) → ponownie **👥 Utwórz / zaktualizuj…**
6. **⏰ Włącz automat (co 15 minut)**.

### B. Dodatek
1. script.google.com → Nowy projekt; Ustawienia → „Pokaż plik manifestu”.
2. Wklej `dodatek/appsscript.json` i `dodatek/Kod.gs`.
3. Uzupełnij w `CONFIG`: `ID_ARKUSZA`, `ID_FOLDERU_PROJEKTOW`, `ZAKLADKI` (jak w „Zadaniu projektowym”)
   oraz `WLASCICIEL_PLIKOW` (e-mail administratora).
4. Uruchom `testMojegoArkusza`, potem Wdróż → Wdrożenia testowe → Zainstaluj → odśwież Kalendarz.
5. Pracownicy: udostępnij im projekt dodatku; każdy instaluje wdrożenie testowe u siebie.

## Konfiguracja

| Zaślepka | Plik | Skąd wziąć |
|---|---|---|
| `TU_WKLEJ_ID_ARKUSZA_SLOWNIKA` | `dodatek/Kod.gs` | adres arkusza-słownika: `docs.google.com/spreadsheets/d/<ID>/edit` |
| `TU_WKLEJ_ID_FOLDERU_PROJEKTOW` | `dodatek/Kod.gs` | adres folderu: `drive.google.com/drive/folders/<ID>` |
| `ZAKLADKI` | `dodatek/Kod.gs` | przykładowa konfiguracja – nazwy zakładek, kolumny i filtry własnego słownika |
| `WLASCICIEL_PLIKOW` | `dodatek/Kod.gs` | e-mail administratora (puste = bez sprawdzania właściciela) |

## Ograniczenia

- Dodatek działa tylko w przeglądarce na komputerze.
- Zamknięty panel nie liczy czasu „na żywo” – niezakończony slot domyka automat albo dodatek przy otwarciu.
- Pracownik może edytować swój arkusz bezpośrednio (z ostrzeżeniem) – takie zmiany sprawdza tylko „RAPORT”.
- Slot nie przechodzi przez północ – pracę po północy wpisuje się jako dwa sloty.
