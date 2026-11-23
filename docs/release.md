# Building and releasing StudioVD

How installers are made (PLAN 15.6, 15.7) and what a release needs that only the project
owner can provide: signing certificates, keys and a place to publish.

## Installers

`npm run tauri build` makes, per platform (targets in `src-tauri/tauri.conf.json`):

| Platform | Files | Notes |
|---|---|---|
| Windows | `bundle/nsis/StudioVD_<v>_x64-setup.exe`, `bundle/msi/StudioVD_<v>_x64_en-US.msi` | Per-user NSIS install; both install WebView2 through Microsoft's bootstrapper when it is missing (needs internet on that machine once) |
| Linux | `bundle/appimage/StudioVD_<v>_amd64.AppImage`, `bundle/deb/StudioVD_<v>_amd64.deb` | The .deb installs the `application/x-studiovd` MIME type and a desktop entry; it depends on `libwebkit2gtk-4.1-0` |

Both register the `.stvd` file association ("StudioVD project"); a double click opens the
file in the running StudioVD if one is open (single instance).

CI (`.github/workflows/ci.yml`, job "Installers") builds both on pushes to `main`, on `v*`
tags and on manual runs (Actions › CI › Run workflow), after the checks pass, and keeps the
installers as workflow artifacts for 14 days. They are **unsigned**. Every push also runs
`cargo-deny` (`src-tauri/deny.toml`: advisories, licences, banned crates, sources).

## Code signing (the owner's)

- **Windows**: without a signature, SmartScreen warns on first run. Use an OV/EV code-signing
  certificate (or Azure Trusted Signing) and set `bundle.windows.certificateThumbprint`,
  `digestAlgorithm: "sha256"` and `timestampUrl`, or a `signCommand` for a cloud HSM. Sign
  both the NSIS and MSI outputs. Keep certificates out of the repository (CI secrets).
- **Linux**: AppImage and .deb are not signed by default. Publish SHA-256 sums with each
  release and, if wanted, a detached GPG signature of the sums file.
- macOS is not a target.

## Updater (optional, not enabled)

The Tauri updater would need its own minisign key (never the catalog keys of
`docs/catalog-signing.md`), a `latest.json` endpoint and `bundle.createUpdaterArtifacts`. It is
left out: installing over an older version keeps projects and the library, which live outside
the install folder.

## Release checklist

1. `PLAN.md` phases ticked; `npm run check`, `npm run format:check`, `npm run build`,
   `npm run check:offline`, the full E2E in Chromium and WebKit, and the Rust checks pass.
2. Version bumped in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. `public/third-party-notices.txt` regenerated (`npm run notices`) and reviewed: it ships in
   the app (Help › About › Third-party notices). Entries marked UNKNOWN need an answer from
   upstream before release (today: `@react-three/rapier`, which publishes no licence).
4. Installers built on CI (or locally on each OS), signed, smoke-tested on a clean machine:
   start, open a `.stvd` by double click, import STEP, Save, reopen, Help › About.
5. Published with SHA-256 sums.
