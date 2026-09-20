# shared/

What the web (this repo) and the Flutter app (`chord_sequencer`) must agree on. See
`docs/plan-paridad-web-app.md`.

| Path | What | Who writes it |
|---|---|---|
| `schema/song-doc.schema.json` | The song document both clients read and write (`progressions.data`) | by hand, with the plan |
| `catalog/*.json` | Styles, chord qualities, sounds, aliases | `npm run shared:export`, from the web code — never by hand |
| `fixtures/songs/*.json` | Golden songs: each client must load and save them without losing a field | by hand |
| `VERSION.json` | Schema version + catalog hash | `npm run shared:export` |

The app copies this folder with `dart run tool/sync_shared.dart` (from the app repo), and its
tests fail when the copy's hash does not match `VERSION.json`.

Rules:
- The web is the sound reference: the catalog is generated from `src/lib/styles.ts`,
  `musicTheory.ts`, `bassScale.ts` and `instruments.ts`.
- Unknown fields are carried through untouched by every client that saves a song.
- App-only data lives under `app` (song level and section level) until the web models it.
