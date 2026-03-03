---
description: ログ整理
---

F:\DEVELOPFOLDER\RE-NAME-SYS\public\log-check
配下の全ログを精査し、50音順にsortする。





sort後以下の内容ごとに分類わけし、一ファイルにまとめる。出力先は同階層に「調査.txt」として出力する

## 💎 【最終完全版】ログから抽出可能な全データ項目一覧

### 0. セッション基本メタデータ - **【標準搭載】**
- **セッション継続時間 (Session Lifetime)**: 起動から現在までの累計時間（秒）。
- **ログイン/ログアウト時刻**: プレイ開始と終了の絶対時刻。

### 1. セッション・システム基本情報（起動時） - **【開発者モード限定】**
- **ビルド情報**: VRChat Build, Store (Steam/Oculus), Beta Branch
- **ハードウェア**: Device Model, CPU, GPU (Name, Version, Memory), RAM Size, OS Version
- **入力デバイス**: HMD Model, 接続されているコントローラーの種類（左右個別）
- **SDK**: EOS (Epic Online Services) Version, SteamVR Initialize Status
- **外部統合**: Discord 接続状態, Steam AppID 連携

### 2. インフラ・ネットワーク接続 - **【開発者モード限定】**
- **サーバー接続**: Websockets API 接続成功/失敗, Photon ネームサーバー, Photon Master サーバー
- **リージョン**: 自動検出された最適リージョン (Japan/US/EU), 名前解決ホスト
- **API Status**: VRChat API / CDN の疎通状態 (“pong” レスポンス)
- **認証**: ログイン方法 (VRChat/Steam), アカウント種別（Verify状態）, VRChat+ 加入状況

### 3. ユーザー設定（起動時および変更時スナップショット）
- **オーディオ**: マイクボリューム (VR/Desktop), Noise Gate, Noise Suppression, Master/UI/World 各ボリューム
- **グラフィックス**: Quality プリセット, AA設定, Near Clip Override, Mirror Resolution, FPS/Ping 表示設定
- **快適性・安全**: Locomotion Method, Comfort Turning, Safety Level, アバター表示制限 (Performance Rating 閾値)
- **チャット**: Chat Bubble の可視性, サイズ, 不透明度, タイムアウト秒数
- **OSC**: OSC 有効化フラグ, 送受信ポート番号

### 4. ソーシャル・通知（履歴保存用）
- **受取通知**: 
  - `Boop`: 送信者名、誰に送られたか
  - `friendRequest`: 送信者名、ユーザーID
  - `requestInvite`: 送信者名、**カスタムメッセージ内容**（例: "今からインスタンス開きます" 等）
- **ユーザー自身の操作（ローカル）**: 
  - `AcceptNotification`: **自分が**通知（招待等）に対してクリックした承諾アクションの記録
  - 直近のフレンド追加成功/失敗（**自身の**リクエスト結果）
  - ブロック/ミュート設定の変更（**自身が**行った設定変更）
  - マイクの切替、ボリューム変更などのデバイス操作

### 5. ワールド入室・体験
- **入室詳細**: World ID, Instance ID, リージョン, アクセス種別 (Private/Friends/Public)
- **ロード解析（開発者限定）**: 
  - グラニュラーな読込時間（`instantiateScene`, `WarmShaders`, `download`, `enterWorld` 等の秒数）
  - 合計ロード所要時間
- **ネットワーク役割**: `I am MASTER`（マスタークライアント権限）の取得、および `OnMasterClientSwitched` による権限移行の履歴

### 6. パフォーマンス・負荷統計（毎分Heartbeat / 開発者限定）
- **基本メトリクス**: mean/min/max FPS, mean/min/max Ping
- **メモリ**: Managed Memory (Mono), Texture Memory (Total, Non-streaming, Saved by streaming)
- **詳細プロファイラ**: `System.GC.GetTotalMemory`, `Profiler.GetTotalAllocated/Reserved`, `Mono Heap Size` 等のUnityエンジンの生メモリ統計。
- **描画負荷**: 可視ポリゴン数 (Visible Poly Count), Skinned Mesh Count, Material Count
- **アバター負荷**: 周囲の Avatar Performance Rating 分布（Excellent～VeryPoor が何人いるか）
- **ネットワーク帯域**: 
  - Net Bytes/Events (Serialization, Physics, Udon 分類別)
  - **パケット分散**: インスタンスメタデータの送信バイト数と「何個の束（bunches）」で送られたかの分割記録。
  - **ダウンロード速度**: `[AssetBundleDownloadManager]` による平均ダウンロード速度（bytes per second）。

### 7. アバター・表現
- **アバター詳細**: **【プライバシー保護のため廃止】** Avatar Name, Avatar ID の保存は行わない。
- **調整**: アバターのスケーリング（Eye Height 制限値の設定変更）
- **相互作用**: Avatar Interaction の有効/無効、Level 設定

### 8. Udon ギミック・外部連携
- **スクリプト動作**: 
  - 主要なギミック（`USharpVideo`, `YamaStream`等）の初期化や主要イベント
  - `[TLP]` 等のサードパーティロガーの出力内容
  - ※ `QvPen` 関連の描画・同期ログは不要として除外
- **OSC サービス検出**: ローカルネットワーク上の OSC サービス（例: `OyasumiVR`）の自動検出とポート番号
- **ビデオプレイヤー**: 再生した URL, 解決された動画形式、解決時間 (yt-dlp 動作ログ)

### 9. エラー・デバッグ（開発者限定）
- **例外**: `NullReferenceException`, `UdonVMException` の完全なスタックトレース
- **APIエラー**: 404/401/503 等の API リクエスト失敗ログ
- **その他**: アバターロード失敗、シェーダーコンパイルエラー、音声デバイス切替失敗

### 10. 高度なハードウェア・ランタイム統計（開発者限定）
- **入力遅延**: ユーザーの操作が反映されるまでの `input_latency` (ms)。
- **フレームタイム詳細**: CPUおよびGPUそれぞれの処理時間（`cpu_frame_time`, `gpu_frame_time`）。
- **トラストレベル権限**: ユーザー自身に付与されている機能制限ランク（`DeveloperTrustLevel`, `AdvancedTrustLevel`, `BasicTrustLevel` 等）。
- **HMD・トラッキング詳細**: 使用しているHMDの正確なモデル名（Quest 3等）とトラッキングシステム（Oculus / SteamVR）の種別。

### 13. 写真・メディア（ファイル連携用）
- **スクリーンショット保存パス**: カメラ使用時に **ローカルPC上の絶対パス**（例: `C:\Users\...\VRChat_..._3840x2160.png`）と、その解像度が記録されます。
- **動画プレイヤー解析**: `[AVProVideo]` による動画再生URLと、yt-dlpがURLを解決した際のメタデータ。

### 14. 課金・VRC+ (サブスクリプション)
- **VRC+ 加入状況**: ログイン時に `No Active Subscription detected` または `Active:True` と、**サブスクリプションID** が記録されます。
- **マーケットプレイス**: `[Purchasing]` カテゴリが存在し、初期化の成否が記録されますが、個別の購入履歴（コイン枚数等）の詳細は出力されません。

### 15. ワールド固有データ (Udon Persistence)
- **保存データ本体**: `[VRCX-World]` などのタグで、ワールドがセーブした **巨大なシリアライズデータ（英数字の羅列）** が記録されます（例: `v7-F82B...`）。
- **セーブタイミング**: `[SaveSystem]` によるキュー追加や変更のプッシュ通知。

---

### 16. 高密度ソーシャル・インタラクション（Udon/World固有）
VRChat本体だけでなく、ワールドに設置されたギミック（Udon）が出力するログには、極めて詳細な行動記録が含まれます。
- **詳細な入退出ログ**: `[Behaviour] OnPlayerJoined` タグにより、表示名だけでなく **恒久的なユーザーID (usr_...)** が入退室のたびに記録されます。
- **発話・ボイス状態**: `[VoiceLine]` タグ等により、**「誰が今喋っているか」** のリアルタイムな切り替わりが記録される場合があります。
- **集合写真・名前リスト**: `[VisitorsInformationBoard]` 等の有名ギミックは、インスタンス内にいたプレイヤーのリストや、**「誰がいつ写真を撮られたか」** という詳細な予約状況を記録します。
- **外部Webデータのリロード**: `[YTTL]` 等のシステムが GitHub や Gist から取得した **外部のタイトル、説明文、閲覧数** などのテキストデータ。
- **収集対象外**: 特定のワールドが独自に出力するシナリオテキストや選択肢ログ（例: `Text="選択肢A"`, `Renew="Enter"` 等）は、汎用性が低くプライバシーおよびプロジェクトの目的外であるため、収集対象から除外する。

### 17. サードパーティ拡張ツールの痕跡 (VRCX等) - **【収集禁止】**
- **理由**: 外部ツール独自のデータであり、プライバシー保護の観点および本プロジェクトの目的外であるため、**一切の収集・保存を行わない。**
- **対象外データ**: `[VRCX-World]` タグを含むすべての外部ツール専用シリアライズデータ。

### 18. 内部設定・ベータ機能 (EOS/RemoteConfig) - **【開発者モード限定】**
- **RemoteConfig**: `Experiment` や `Feature Flag` 等、VRChatが内部的にテストしている機能の ON/OFF 状態。
- **EOS (Epic Online Services)**: 認証リフレッシュやSDK同期。

---

## 👥 他ユーザーの活動が関わってくるログ項目一覧

### 1. ユーザーの入退出
- **`OnPlayerJoined` / `OnPlayerLeft`**: インスタンスに誰かが入った、あるいは去った記録 (usr_ID付)。

### 2. ソーシャル・リアクション
- **`Boop` / `invite` / `requestInvite`**: 誰からアクションが届いたか。

### 3. メディア・Udon活動
- **ビデオプレイヤー**: 再生した URL の履歴のみ（※「誰がリクエストしたか」はプライバシー保護のため収集対象外）。
- **ワールド内活動**: 集合写真の予約リスト、ボイス状態の変化履歴、マスター権限の交代。

---
