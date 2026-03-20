# 技術スタック ツール導入メモ

> Tauri（Rust + React/TypeScript）プロジェクト向け。Cloudflare系は除外済み。

---

## 使えるツール一覧

### TanStack Router

**何をしてくれるか**
URLのタイプミスや存在しない画面への遷移を、コードを書いた時点でエディタが教えてくれる。
画面遷移したら真っ白だった、というランタイムエラーが減る。

**導入方法**
```bash
bun add @tanstack/react-router
bun add -D @tanstack/router-plugin
```
`vite.config.ts` にプラグインを追加する。

---

### Zod v4

**何をしてくれるか**
Tauriの `invoke()` でRustから受け取ったJSONの形を検証する。
「このデータは `id` が数字で `name` が文字列のはず」と定義しておくと、
形が違えば即エラーになる。Rustの返却値が変わったときにフロント側で気づける。

**導入方法**
```bash
bun add zod
```
追加設定不要。

**使用例**
```ts
import { z } from "zod"

const PhotoSchema = z.object({
  id: z.number(),
  name: z.string(),
  takenAt: z.string(),
})

// invoke の戻り値をパース
const raw = await invoke("get_photos")
const photos = z.array(PhotoSchema).parse(raw) // 型が違えばここでエラー
```

---

### OxLint

**何をしてくれるか**
コードの悪い書き方をWordの赤波線みたいに自動で指摘してくれる文法チェッカー。
ESLintより10〜100倍速い。
`import/no-cycle` 機能で循環依存（AがBを使ってBがAを使う状態）も検出できる。

**導入方法**
```bash
bun add -D oxlint
```
`package.json` にスクリプト追加：
```json
{
  "scripts": {
    "lint": "oxlint --import-plugin src/"
  }
}
```
`oxlintrc.json` を作成：
```json
{
  "rules": {
    "import/no-cycle": "error"
  }
}
```

---

### knip

**何をしてくれるか**
リファクタリング後に残った、誰も使っていないファイル・関数・ライブラリを一覧で出してくれる掃除ロボット。
手動で `Ctrl+F` で追いかける必要がなくなる。

**導入方法**
```bash
bun add -D knip
```
`package.json` にスクリプト追加：
```json
{
  "scripts": {
    "knip": "knip"
  }
}
```
`knip.json` を作成（Tauriの場合）：
```json
{
  "entry": ["src/main.tsx", "src/routes/**/*.tsx"],
  "project": ["src/**/*.{ts,tsx}"]
}
```

---

### Vitest

**何をしてくれるか**
「この入力を入れたらこの結果になるはず」というコードを書いておくと毎回自動で確認してくれる。
pHashの重複検出ロジックやStargazerのマッチングロジックなど、
純粋な計算関数のテストに特に向いている。
Viteと設定共有できるのでセットアップがほぼゼロ。

**導入方法**
```bash
bun add -D vitest
```
`package.json` にスクリプト追加：
```json
{
  "scripts": {
    "test": "vitest"
  }
}
```
テストファイルの例（`src/lib/hash.test.ts`）：
```ts
import { test, expect } from "vitest"
import { calcPHash } from "./hash"

test("同じ画像はハッシュが一致する", () => {
  const hash = calcPHash(sampleImageData)
  expect(hash).toBe(expectedHash)
})
```

---

### Bun

**何をしてくれるか**
`npm install` が体感3〜5倍速くなる。それだけ。

**導入方法**
```bash
# インストール（macOS/Linux）
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```
既存プロジェクトへの移行：
```bash
bun install  # package-lock.json の代わりに bun.lockb が生成される
```

---

### Lefthook

**何をしてくれるか**
`git commit` を実行した瞬間に型エラー・文法チェックを自動実行して、
問題があればコミットを止めてくれる門番。
CodexやAntigravityなどのAIエージェントがコミットする際にも通るので、
AIが壊したコードがmainに入るのを防げる。

**導入方法**
```bash
bun add -D lefthook
lefthook install  # .git/hooks に登録される
```
`lefthook.yml` を作成：
```yaml
pre-commit:
  parallel: true
  commands:
    lint:
      run: bun run lint
    typecheck:
      run: bun run typecheck
```

---

## 推奨導入順序

| 優先度 | ツール | 理由 |
|--------|--------|------|
| ★★★ | Zod v4 | `invoke()` の型安全化。すぐ恩恵を感じられる |
| ★★★ | OxLint + knip | 導入コストほぼゼロで品質が上がる |
| ★★☆ | Lefthook | AIエージェント運用しているなら特に価値あり |
| ★☆☆ | Vitest | ロジック層が厚くなってきたら |
| ★☆☆ | TanStack Router | 画面遷移が増えてきたタイミングで |
| ★☆☆ | Bun | いつでも（移行コストほぼゼロ） |
