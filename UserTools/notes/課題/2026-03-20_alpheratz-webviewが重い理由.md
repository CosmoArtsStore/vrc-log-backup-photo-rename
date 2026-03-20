# Alpheratz で WebView が重く見える理由

## 結論

`WebView2` が別プロセスで存在すること自体は正常。

重く見える主因は「WebView が悪い」単体ではなく、以下の合算で膨らんでいる可能性が高い。

1. 画像のデコード済みメモリ
2. GPU テクスチャ保持
3. 同時に画面へ出しているカード数
4. スクロール近傍の先読み
5. モーダルや類似写真などの追加 UI が持つ画像参照
6. blur / ガラス調 UI / アニメーション / scroll 追従の積み重ね

## 前提

`Alpheratz` は Electron ではなく `Tauri 2 + WebView2` で動いている。

そのため:

- `Alpheratz.exe` と `msedgewebview2.exe` 系にメモリが分かれる
- タスクマネージャでは WebView 側のプロセスが大きく見える
- これは 1 プロセスのネイティブ UI アプリとは見え方が違う

この「別プロセスに見える」こと自体は異常ではない。

## このアプリで重くなりやすい実装要因

### 1. 一覧やギャラリーで大量の画像を出す設計

標準グリッドでは `react-window` による仮想化を使っているが、見えている範囲のカードにはサムネイルを都度読み込んでいる。

該当:

- `Alpheratz/src/components/PhotoGrid.tsx`
- `Alpheratz/src/components/PhotoCard.tsx`

`PhotoCard.tsx` では各カードごとに `create_grid_thumbnail` を呼び、画像 URL を `img` へ渡している。

これはファイルサイズでは軽く見えても、WebView 内ではデコード後のピクセルメモリと GPU テクスチャに載るので、枚数が増えると効く。

### 2. ギャラリーは仮想化しているが、画面近傍を広めに持つ

ギャラリーは完全な無限描画ではなく、可視範囲に加えてオーバースキャンで前後も描画している。

該当:

- `Alpheratz/src/components/PhotoGrid.tsx`

つまり画面に見えていない近傍カードも先に DOM へ載る。

これはスクロール体験のためには必要だが、表示枚数と画像保持量は増える。

### 3. IntersectionObserver による近傍先読み

ギャラリーカードと類似写真サムネイルに加え、現在は標準グリッドのカードも `IntersectionObserver` で「近づいたら読む / 離れたら解放する」方式になっている。

該当:

- `Alpheratz/src/components/PhotoCard.tsx`
- `Alpheratz/src/components/GalleryPhotoCard.tsx`
- `Alpheratz/src/components/PhotoModal.tsx`

この設計は正しいが、先読み幅が広いほど同時保持量は増える。

### 4. GPU プロセスに効くのは「ファイルサイズ」より「展開後サイズ」

JPEG や PNG の容量が小さくても、表示時には RGBA 相当へ展開される。

例えば一覧に同時表示される画像が多いと:

- デコード済みビットマップ
- GPU 側テクスチャ

が積み上がる。

そのため、ディスク上では軽い画像でも WebView2 の GPU プロセスが大きく見えやすい。

### 5. モーダルで追加の画像参照を持つ

写真モーダルを開くと、本体画像に加えて類似写真のサムネイルや各種オーバーレイ UI が増える。

該当:

- `Alpheratz/src/components/PhotoModal.tsx`

モーダル自体は 1 枚でも、類似写真 strip を開いた時点で別の `img` 群を保持するため、一覧のみの時より重くなりやすい。

## 画像以外で重くなりやすい要素

### 6. `backdrop-filter` の常用

これは見た目に効くが、GPU 合成コストを上げやすい。

該当例:

- `App.css` の `filter-backdrop`
- `App.css` の `month-nav-tooltip-inner`
- `App.css` の `hover-tooltip-inner`
- `App.css` の `gallery-quick-favorite-star`
- `App.css` の `quick-action-tooltip`
- `App.css` の `modal-overlay`
- `App.css` の toast 系

特に「画像の上に半透明レイヤー + blur」を重ねる組み合わせは重くなりやすい。

### 7. お気に入り演出のアニメーション

`AnimatedFavoriteStar` とそれに対応する CSS は、見た目としては良いがかなり装飾量が多い。

該当:

- `Alpheratz/src/components/AnimatedFavoriteStar.tsx`
- `App.css` の `favorite-star-*`

内容:

- bloom
- shard
- blur
- drop-shadow
- scale / rotate
- 複数 keyframes

これらは「1 個なら軽い」が、一覧やギャラリーで星アイコンが多く出ると積み上がる。

### 8. hover 時の transform / shadow が多い

カード、ボタン、サムネイルに `transform` と `box-shadow` が多く入っている。

該当例:

- `photo-card:hover`
- `gallery-photo-card:hover`
- `similar-photo-thumb:hover`
- `left-rail-button:hover`
- `photo-action-*`

これも単体では大きくないが、hover 対象が多い UI だと合成レイヤーが増えやすい。

### 9. モーダルのオーバーレイとポップアップ演出

モーダルは画像表示に加えて、以下の負荷が重なる。

- 背景全体の半透明オーバーレイ
- blur
- scale / translate アニメーション
- box-shadow

該当例:

- `App.css` の `modal-overlay`
- `App.css` の `modal-content`
- `App.css` の `a-modal-overlay-in`
- `App.css` の `a-modal-content-in`

つまりモーダルは「画像そのもの」だけでなく「開閉演出」も GPU コストを持つ。

### 10. shimmer / spinner 系アニメーション

スケルトンやローディング演出も常時回ると無視できない。

該当例:

- `photo-thumb-skeleton` の shimmer
- `similar-photo-thumb-skeleton` の shimmer
- `inline-spinner`

枚数が多い時や、読み込み中が長い時は repaint が継続する。

### 11. スクロール同期処理

一覧スクロールは単なる CSS スクロールだけではなく、JS 側で scrollTop を握っている。

該当:

- `Alpheratz/src/hooks/useScroll.ts`
- `Alpheratz/src/components/MonthNav.tsx`

内容:

- `requestAnimationFrame` で scrollTop 更新
- `scrollTo` / `scrollTop` の明示制御
- スクラブバーの追従計算

これは必要な処理だが、スクロール関連処理が多いほど WebView の main thread には負荷が乗る。

### 12. `ResizeObserver` / `IntersectionObserver` の多用

監視系 API は正しい選択だが、対象が多いと callback 回数が増える。

該当:

- `useGridDimensions.ts` の `ResizeObserver`
- `PhotoCard.tsx` の `IntersectionObserver`
- `GalleryPhotoCard.tsx` の `IntersectionObserver`
- `PhotoModal.tsx` の `IntersectionObserver`

特に「カード単位で observer を張る」設計は、画像数が多い画面では管理コストを積み上げる。

## 逆に、今すでに入っている軽量化

完全に無対策ではない。現在入っている軽量化は以下。

- 標準グリッドは `react-window` で仮想化
- ギャラリーは自前レイアウトで可視範囲中心に限定描画
- 標準 / ギャラリー / 類似写真で画面外 `src` を解放する方向へ寄せてある
- サムネイルは用途別にキャッシュ分離されている
- 先読み幅は以前より縮小されている

つまり「全部無駄に描いている」わけではない。

## 現実的な改善順

### 🥇 1位：画面外 `img` の `src` 解放

これは一番効く。

現状:

- 標準グリッド
- ギャラリー
- 類似写真

で順次導入済み、または強化済み。

この方向は今後も維持すべき。

### 🥈 2位：overscan と先読み範囲の縮小

地味だが確実に効く。

特にギャラリーの overscan は、スクロールの気持ちよさとのトレードオフで調整する価値が高い。

### 🥉 3位：モーダル内の類似写真 lazy 強化

類似写真は本体画像とは別の追加コストなので、strip を開くまで読まない方針を徹底する。

### 4位：`backdrop-filter` の削減

画像上にかかるガラス調 UI は見た目の満足度が高い反面、GPU 合成コストを上げやすい。

### 5位：お気に入り演出の軽量化

favorite 演出は派手な分、負荷削減対象としては効率が良い。

### 6位：hover shadow / transform の整理

一覧・ギャラリー・モーダルで hover 演出が多いため、まとめて薄くすると全体コストを下げやすい。

## 一言で言うと

`WebView2` が重いのではなく、

- 画像アプリ
- GPU 合成
- 先読み
- 同時表示枚数
- blur / ガラス調 UI
- favorite 演出
- scroll / observer 追従

の組み合わせで、`WebView2` プロセスに負荷が見えやすくなっている。


スクロール高速時に1000MB超えるのは「解放が追いつかず読み込みが先行する」チャーン現象です。対応すべき案件を優先順で整理します。

---

## 🔴 緊急（スクロールスパイクの直接原因）

### 1. overscan を削る
高速スクロール時に「まだ見えていないカード」を大量先読みしているのが主因です。

```tsx
// PhotoGrid.tsx
overscan = 240 → 40〜60 に
```
スクロールの滑らかさより安定性を優先すべきフェーズです。

### 2. 高速スクロール中の src 解放を debounce する
現状は「見えなくなった瞬間に解放 → すぐ戻ってきたら再取得」のチャーンが高速スクロール時に連続発生しています。

```tsx
// GalleryPhotoCard.tsx
const [visible, setVisible] = useState(false);

// ← こうではなく
observer.onLeave → setVisible(false) 即時

// → こうする
observer.onLeave → setTimeout(() => setVisible(false), 200)
```
200ms 程度の猶予を置くだけでチャーンが激減します。

### 3. per-card Observer を単一 Observer に統合
カードごとに `IntersectionObserver` を張る設計は、カード数が多い画面で callback 数が爆発します。

```tsx
// 現状: カード×N 個の observer
// 改善: 親コンポーネントで1つの observer を持ち、
//       各カードの ref を observe() するだけ
const observer = new IntersectionObserver(callback, options);
cardRefs.forEach(ref => observer.observe(ref.current));
```

---

## 🟡 中優先（ベースライン削減）

### 4. ギャラリーオーバーレイの `backdrop-filter` を外す
`gallery-photo-overlay` と `gallery-quick-favorite-star` の blur は、スクロール中に全表示カード分の GPU 合成が走ります。見た目への影響は小さいので外せます。

### 5. shimmer を CSS `will-change` なしにする
スケルトンの shimmer が多数走るとrepaintが継続します。`will-change: transform` を外して通常フローに戻すだけで多少軽くなります。

---

## 🟢 後回しでいい

- favorite 演出の軽量化（常時発火ではないので優先度低）
- hover shadow / transform の整理（静止時は問題ない）
- モーダルの類似写真 lazy 強化（モーダル開放時の問題なので別件）

---

## 作業順のおすすめ

```
overscan削減（5分）
  → debounce追加（15分）
  → 測定（800MB以下に収まるか確認）
  → Observer統合（30分）
  → backdrop-filter除去（10分）
```

`PhotoGrid.tsx` の overscan だけでも先に変えてみて、スクロール時のピークがどこまで下がるか見るのが一番手っ取り早いです。