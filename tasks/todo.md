# STELLAProject Revision Instructions (2nd Edition)

## Instruction 1: Log Standardization & `println!` Replacement
- [ ] Step 1: Survey `println!`, `eprintln!`, `print!` in all Rust files.
    - [ ] Polaris
    - [ ] StellaRecord
    - [ ] Alpheratz
- [ ] Step 2: Implement common log functions (`log_msg`, `log_warn`, `log_err`) using `info.log` in `InstallLocation`.
    - [ ] Polaris (Update existing functions)
    - [ ] StellaRecord
    - [ ] Alpheratz
- [ ] Step 3: Replace `println!`/`eprintln!` with log functions.
    - [ ] Polaris
    - [ ] StellaRecord
    - [ ] Alpheratz
- [ ] Step 4: Unify all log file references (e.g., `error_info.log`, `crash.log`) to `info.log`.
- [ ] Step 5: Verify no `println!`/`eprintln!` remains using grep.

## Instruction 2: NSIS `taskkill` Suppression
- [ ] Update `StellaRecord/stella_record_ui/src-tauri/windows/hooks.nsi` to use `nsExec::Exec` and `2>nul`.
- [ ] Update `Alpheratz/src-tauri/windows/hooks.nsi` to use `nsExec::Exec` and `2>nul`.

## Instruction 3: NSIS Asset Images (.bmp)
- [ ] Generate 150x57 px BMP (24bit) header images.
- [ ] Update `Alpheratz/src-tauri/windows/installer.nsi` to use `header.bmp`.
- [ ] Update `StellaRecord/stella_record_ui/src-tauri/windows/installer.nsi` to use `header.bmp`.
- [ ] Check/Update Polaris NSIS for the same.

## Instruction 4: Window Title (StellaRecord)
- [ ] Change `STELLA_RECORD` to `STELLA RECORD` in `tauri.conf.json`.
- [ ] Change `STELLA_RECORD` to `STELLA RECORD` in `installer.nsi`.
- [ ] Check other locations for window title strings.

## Instruction 5: `rust-toolchain.toml` Version Lock
- [ ] Check current `stable` Rust version (`rustup show`).
- [ ] Fix version in `Polaris/src-tauri/rust-toolchain.toml`.
- [ ] Fix version in `StellaRecord/stella_record_ui/src-tauri/rust-toolchain.toml`.
- [ ] Fix version in `Alpheratz/src-tauri/rust-toolchain.toml`.

## Instruction 6: Asset Protocol & Capabilities (Alpheratz)
- [ ] Restrict `assetProtocol.scope` to specific image extensions in `tauri.conf.json`.
- [ ] Explicitly disable network permissions in all apps' `capabilities/`.
- [ ] Unify all log file names to `info.log` (already in Instruction 1 but confirming).

## Instruction 7: Startup Registration Removal
- [ ] Remove `WriteRegStr` for Run key in `StellaRecord/stella_record_ui/src-tauri/windows/hooks.nsi`.
- [ ] Remove `WriteRegStr` for Run key in `Alpheratz/src-tauri/windows/hooks.nsi`.

## Instruction 8: Workspace Definition Fix
- [ ] Fix `workspaces` in root `package.json`.
- [ ] Fix `workspaces` in `StellaRecord/package.json`.
- [ ] Verify `npm install` works.

## Instruction 8-B: JSON Path Standardization
- [ ] Investigate/Report locations and usage of `pleiades.json` and `jewelBox.json`.
- [ ] Fix paths to use registry-based `InstallLocation`.

## Instruction 9: Vite config Sync Style
- [ ] Convert `StellaRecord/stella_record_ui/vite.config.ts` to sync style.
- [ ] Convert `Alpheratz/vite.config.ts` to sync style.

## Instruction 10: `authors` in `Cargo.toml`
- [ ] Change `authors` to `["CosmoArtsStore"]` in all apps.

## Instruction 11: Env Var Fallback Fix
- [ ] Survey `unwrap_or_default`, `unwrap_or_else`, `unwrap_or("")` on env vars.
- [ ] Replace with `.ok()?` or proper error handling.

## Instruction 12: plugin.json Integration (Pending 8-B)
- [ ] Draft `plugin.json` structure and report.
- [ ] (After approval) Integrate `pleiades.json` and `jewelBox.json` into `plugin.json`.

---
## Verification Checklist
- [ ] No `println!`/`eprintln!` (grep)
- [ ] All logs unified to `info.log` in `InstallLocation`
- [ ] NSIS `taskkill` hidden/suppressed
- [ ] NSIS header images are .bmp (150x57)
- [ ] StellaRecord title is "STELLA RECORD"
- [ ] `rust-toolchain.toml` versions fixed
- [ ] Alpheratz `assetProtocol.scope` restricted
- [ ] No network permissions in Capabilities
- [ ] Startup entries removed for StellaRecord/Alpheratz
- [ ] Workspaces definition correct
- [ ] Vite configs improved to sync style
- [ ] `authors` is "CosmoArtsStore"
- [ ] Env var lookups are safe
- [ ] `pleiades.json` / `jewelBox.json` standardized
