# STELLA RECORD プロジェクト：エージェント動作極則

本プロジェクトに従事する AI エージェントは、以下のプロセスを「思考の 0 段階目」として必ず実行すること。

## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## 1. 指導原理（Design-First）
- **設計なしの実装禁止**: どのような小規模な修正であっても、まず `public\docs_rule\INTERNAL_DESIGN_RULE.md` を読み、現在の `public\STELLA_RECORD_統合仕様書.md` または各詳細設計書との整合性を確認すること。
- **施工図の更新**: 実装前に必ず設計（md ファイル）を更新し、ユーザーに「設計の変更内容」を提示して承認を得てからコードを触ること。
- **事後報告の禁止**: 「直しておきました」ではなく「このように設計を直したので、実装します」という順序を徹底すること。

## 2. 視覚的・構造的ルール
- **Stargazer UI 準拠**: すべてのアプリ UI、ドキュメント HTML は Stargazer デザイン言語（深宇宙、グラスモーフィズム、Whitneyフォント）を継承すること。
- **フルパスの徹底**: ユーザーが即座に確認できるよう、パスは常に `F:\...` から始まるフルパスで記載すること。
- **製品の独立性**: Polaris, StellaRecord, Alpheratz は独立した製品であり、インストーラー単位で構成を考えること。

## 3. 確認プロセス
- **ユーザー環境での検証**: 最終確認は必ず NSIS インストーラーをビルドし、インストール後の状態で挙動を検証すること。

## 4. ビルド手順（公式・この手順以外は認めない）

### 前提条件
- Node.js, Rust, Tauri CLI がインストール済み
- 作業ディレクトリ: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord`

### ビルドコマンド

#### 1. Polaris（独立インストーラー）
```powershell
npm run build:Polaris-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\Polaris_1.0.0_x64-setup.exe`

#### 2. STELLA_RECORD（メインアプリ、planetarium統合済み）
```powershell
npm run build:StellaRecord-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\STELLA_RECORD_1.0.0_x64-setup.exe`

#### 3. Alpheratz（Pleiades）
```powershell
npm run build:Alpheratz-pkg
```
**生成物**: `F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\target\release\bundle\nsis\Alpheratz_0.1.0_x64-setup.exe`

#### 全アプリ一括ビルド
```powershell
npm run build:Polaris-pkg && npm run build:StellaRecord-pkg && npm run build:Alpheratz-pkg
```

### 重要事項
- **planetarium は stella_record_ui に統合済み**。独立したビルドは不要
- **Polaris は STELLA_RECORD とは完全に独立**したインストーラー
- ビルド前に必ず `cargo check -p stella_record_ui`, `cargo check -p polaris` でコンパイルエラーを確認すること
- この手順以外のビルド方法は一切認めない
## 5. UI/Layout 修正の極則
- **「目視」なき完了の禁止**: レイアウトや UI の修正を行う際は、コードの書き換えだけで完了としてはならない。
- **ブラウザサブエージェントによる DOM 検証**: Tauri 等のバックエンド連携が必要な環境であっても、ブラウザサブエージェントを用いてデバッグサーバー（例: `http://localhost:1420`）にアクセスし、**JavaScript による DOM 操作（Mock データの注入）**を行って、動的な表示や境界条件での挙動（例：データ 0 件時の枠の維持、大量データ時のスクロールバーの到達範囲）が仕様通りであることを物理的に確認すること。
- **エビデンスの提示**: 検証時のスクリーンショットや録画を `walkthrough.md` に添付し、ユーザーが「確かに直っている」と視覚的に確信できる状態にすること。

## 6. その他プロジェクト固有ルール
- F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\Polarisは完全凍結 今後一切触らないこと。
- STELLARECORDのPolaris監視システムはPolaris.exeの監視を行うこと。ボタンを押下したら新規のPolarisが起動すること。
- 依存関係はなくSTELLARECORD-setup.exeには同梱してはならない。
- Gemini 3 Flash Gemini 3.1 Pro(low)に限り、毎回「F:\DEVELOPFOLDER\RE-NAME-SYS\StellaRecord\tasks\lessons.md」を参照すること。

Output must be in Japanese. 常に日本語で出力・返答すること。