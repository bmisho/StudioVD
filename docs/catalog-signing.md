# Signing the component catalog

How the official catalog is signed and how its keys are kept (PLAN 4.4, 14.2). The app's side
is built: `src-tauri/src/library/online/` verifies, caches and guards; it trusts only the keys
compiled into `source.rs`. Creating the keys and the hosting repository is the project owner's
job; nothing here has been done with real keys yet.

## Keys

- Two minisign keypairs: **active** (signs every catalog publish) and **backup** (kept offline,
  only used to sign a catalog after the active key is lost or leaked).
- Never the Tauri updater key, never a key used for anything else.
- Create each on a machine you trust, with a password:

  ```sh
  minisign -G -p studiovd-catalog-active.pub -s studiovd-catalog-active.key
  minisign -G -p studiovd-catalog-backup.pub -s studiovd-catalog-backup.key
  ```

  On Windows: download the `win64` zip from https://github.com/jedisct1/minisign/releases,
  unzip it, and run the same two commands from that folder in PowerShell (`.\minisign.exe -G
  ...`). Each asks for a password twice. Only the two `.pub` files are ever shared.

- Keep both secret keys out of every repository. The backup key goes offline (a USB key in a
  safe, a printed copy); the active key lives where the publish job can use it (a CI secret
  scoped to the hosting repository's release workflow).
- Put both public keys (the second line of each `.pub`) in `OFFICIAL.keys` in
  `src-tauri/src/library/online/source.rs`, active first, with the hosts in `index_bases`
  (where `index.json` and `index.json.minisig` are) and `pack_bases` (where pack URLs resolve).

## Publishing

1. Write `index.json` with the next `sequence` (always higher than any published before; the
   app refuses an index older than the newest it has verified, and a second index with the same
   sequence), `signingKeyId` set to the active key's id (the 16 hex digits on the first line of its `.pub`), an
   `expiresAt` a few months ahead (an expired index is never installed from), and
   `minAppVersion`.
2. Sign it with a trusted comment that binds catalog, sequence and schema:

   ```sh
   minisign -S -s studiovd-catalog-active.key -m index.json \
     -t "studiovd-catalog catalog=official sequence=42 schema=1"
   ```

   The app checks the comment's three fields against the index's own `catalogId`, `sequence`
   and `schemaVersion`, and refuses legacy (non-prehashed) signatures.
3. Upload the packs first (each release `--latest=false`), then `index.json`,
   `index.json.minisig` and the preview packs in the catalog release (`--latest`), so
   `…/releases/latest/download/index.json` always names packs that exist.
4. Smoke test: fetch `latest/download/index.json` and its signature and verify them with
   `minisign -Vm index.json -P <active public key>`.

## Rotation

- **Planned** (the active key is old): add the new key to `OFFICIAL.keys` in an app release,
  keep signing with the old key until that release is widespread, then switch the publish job
  to the new key and, a release later, drop the old key.
- **Compromise** (the active key leaked): sign the next index with the **backup** key at a
  sequence higher than anything the attacker could have signed, publish an app release whose
  `OFFICIAL.keys` drops the leaked key and adds a fresh backup, and announce it in the index's
  `notices`. Installed components keep working; packs are re-checked by SHA-256 against the
  newly signed index before any install.
- Withdraw a bad component by listing it in `revoked` (severity `yanked` or `security`); the
  Library shows a warning for installed copies.
