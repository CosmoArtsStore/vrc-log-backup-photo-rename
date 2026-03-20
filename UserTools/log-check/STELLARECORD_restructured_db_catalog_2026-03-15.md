# STELLARECORD 再構成後DB一覧

作成日: 2026-03-15

対象:
- `STELLARECORD` のログ取込DB再構成案
- ログ分析結果を踏まえた保存先整理

この文書は、再構成後のDBを「どのテーブルがあり、何を意味し、何を保存するのか」で一覧化したもの。

## 1. 全体方針

再構成後のDBは、以下の4系統で整理する。

1. セッション単位の情報
2. 行動履歴のサマリ
3. イベントの生履歴
4. デバッグ寄り情報の退避

特に、デバイス情報や環境情報、詳細設定などの「日常分析より調査向け」の情報は、分散させず1テーブルにまとめる。

これにより、
- 主要分析テーブルを軽く保てる
- デバッグ情報を必要時だけ参照できる
- プライバシー性の高い情報の境界を明確にできる

## 2. 再構成後のDB一覧

### 2.1 app_sessions

意味:
- 1ログファイル = 1セッションとして扱う基点テーブル

何を表すか:
- 「いつのログか」
- 「誰のログか」
- 「どのVRChatビルドか」

主なカラム:
- `id`
- `log_filename`
- `vrchat_build`
- `my_user_id`
- `my_display_name`
- `start_time`
- `end_time`

位置づけ:
- 全テーブルの親
- セッション単位の集計起点

### 2.2 world_visits

意味:
- 実際に入ったワールド訪問履歴

何を表すか:
- 「どのワールドに入ったか」
- 「どのインスタンスだったか」
- 「いつ入っていつ出たか」

主なカラム:
- `id`
- `session_id`
- `world_id`
- `world_name`
- `instance_id`
- `access_type`
- `instance_owner`
- `region`
- `join_time`
- `leave_time`

位置づけ:
- 行動履歴の中核

### 2.3 players

意味:
- 観測したプレイヤーの基本台帳

何を表すか:
- 「この `usr_xxx` は誰か」

主なカラム:
- `id`
- `user_id`
- `display_name`

位置づけ:
- 同席者分析の基礎

### 2.4 player_visits

意味:
- 各ワールド訪問中に誰が同席していたかのサマリ

何を表すか:
- 「誰と同じインスタンスにいたか」
- 「その人がいつ参加し、いつ離脱したか」

主なカラム:
- `id`
- `visit_id`
- `player_id`
- `is_self`
- `join_time`
- `leave_time`

位置づけ:
- プレイヤー統計の基本テーブル

補足:
- これはサマリであり、詳細イベントは別テーブルに持つ

### 2.5 video_playbacks

意味:
- ワールド内で再生された動画URL履歴

何を表すか:
- 「どのワールド滞在中に何のURLが再生されたか」

主なカラム:
- `id`
- `visit_id`
- `url`
- `timestamp`

位置づけ:
- ワールド内行動の補助情報

### 2.6 notifications

意味:
- 受信した通知の履歴

何を表すか:
- 「誰からどんな通知が来たか」
- 「その通知がどのワールドへの誘導か」

主なカラム:
- `id`
- `session_id`
- `notif_id`
- `notif_type`
- `sender_user_id`
- `sender_username`
- `message`
- `created_at`
- `received_at`
- `target_world_id`
- `target_world_name`
- `target_instance_id`
- `target_access_type`
- `target_instance_owner`
- `target_region`

位置づけ:
- 通知履歴
- 合流導線分析の基礎

補足:
- 現状の `notifications` を拡張する想定

### 2.7 travel_events

意味:
- ワールド遷移の試行や確定までの過程を保持するイベントテーブル

何を表すか:
- 「どこへ行こうとしたか」
- 「取得中だったか」
- 「行先が確定したか」
- 「ホーム移動だったか」

主なカラム:
- `id`
- `session_id`
- `event_type`
- `world_id`
- `world_name`
- `instance_id`
- `access_type`
- `instance_owner`
- `region`
- `timestamp`
- `source_notif_id`

`event_type` の意味:
- `home`: ホーム移動起点
- `requested`: 遷移要求
- `fetching`: ワールド情報取得中
- `set`: 行先確定

位置づけ:
- `world_visits` の前段階イベント
- 「行こうとしたが入らなかった」を扱うためのテーブル

### 2.8 player_visit_events

意味:
- プレイヤー出入りの生イベント履歴

何を表すか:
- 「その人が join した」
- 「join 完了した」
- 「left した」

主なカラム:
- `id`
- `visit_id`
- `player_id`
- `event_type`
- `timestamp`

`event_type` の意味:
- `joined`
- `join_complete`
- `left`

位置づけ:
- `player_visits` の元イベント
- サマリでは見えない時系列差分を保持する

### 2.9 session_debug_snapshots

意味:
- デバッグ用途の情報を1か所に集約する退避テーブル

何を表すか:
- セッション中に観測された環境・設定・デバイス・補助状態

このテーブルにまとめる理由:
- 日常分析テーブルに混ぜると用途がぶれる
- 個人環境依存の強い情報を隔離できる
- 必要なときだけ参照できる

主なカラム:
- `id`
- `session_id`
- `snapshot_type`
- `captured_at`
- `key_name`
- `value_text`
- `value_json`

`snapshot_type` の想定:
- `environment`
- `user_settings`
- `audio_device`
- `network`
- `subscription`
- `permission`
- `system_clock`

保存イメージ:
- 環境情報: `snapshot_type='environment'`
- マイク一覧: `snapshot_type='audio_device'`
- VRChat+ 状態: `snapshot_type='subscription'`
- 最適リージョン: `snapshot_type='network'`

位置づけ:
- デバッグ・障害解析専用の退避先

補足:
- 将来必要なら `value_json` にまとめて1回保存もできる
- 検索性重視なら `key_name` / `value_text` で分解保存できる

## 3. テーブルごとの役割整理

### 3.1 日常利用の中心になるテーブル

- `app_sessions`
- `world_visits`
- `players`
- `player_visits`
- `video_playbacks`
- `notifications`

意味:
- STELLARECORDの通常画面や集計機能で直接使う層

### 3.2 行動分析を深くするテーブル

- `travel_events`
- `player_visit_events`

意味:
- サマリだけでは分からない「途中経過」を見る層

### 3.3 デバッグ用に分離するテーブル

- `session_debug_snapshots`

意味:
- 環境依存の強い情報をまとめる層

## 4. session_debug_snapshots に入れる情報

このテーブルには、以下のような「分析より調査向け」の情報を集約する。

### 4.1 デバイス情報

例:
- マイクデバイス名
- デバイス数
- 最小/最大周波数
- XR Device
- 接続コントローラ

意味:
- 音声・VRデバイス不具合の調査材料

### 4.2 環境情報

例:
- Store
- Platform
- Operating System
- Device Model
- Processor Type
- Graphics Device Name
- System Memory Size
- Graphics Memory Size

意味:
- 環境差異による問題切り分け

### 4.3 ユーザー設定情報

例:
- ネットワークリージョン設定
- 音量設定
- マイク設定
- 快適設定
- UI設定
- 安全設定

意味:
- 「その設定だったから起きた」を追うための材料

### 4.4 補助状態

例:
- 最適リージョン
- 現在UTC同期
- ローカル権限取得
- VRChat+ 状態

意味:
- 接続や権限周りの調査補助

## 5. この構成が意味するもの

この再構成は、DBを次のように役割分担することを意味する。

### 5.1 サマリとイベントを分ける

意味:
- よく使う一覧は軽く保つ
- 詳細追跡はイベントテーブルを見る

### 5.2 通知と行動をつなげる

意味:
- 「招待が来た」
- 「その招待先はどこだった」
- 「実際にそこへ移動した」

を同じDB上で追える

### 5.3 デバッグ情報を隔離する

意味:
- 普段の利用者向け分析を汚さない
- でも調査に必要な情報は捨てない

### 5.4 プライバシー境界を明確にする

意味:
- 行動履歴と環境履歴を論理的に分けられる
- UI上でも `session_debug_snapshots` は別タブ・別表示にしやすい

## 6. 最終的な推奨一覧

再構成後の推奨テーブル一覧は次の9個。

1. `app_sessions`
2. `world_visits`
3. `players`
4. `player_visits`
5. `video_playbacks`
6. `notifications`
7. `travel_events`
8. `player_visit_events`
9. `session_debug_snapshots`

この構成であれば、
- 現在のSTELLARECORDの主目的を維持できる
- ログから取れる情報を自然に拡張できる
- デバイス情報や環境情報のようなデバッグ専用データを1テーブルに隔離できる

## 7. 補足

もし実装段階でさらに単純化するなら、最初の更新対象は以下の3点でよい。

1. `notifications` の拡張
2. `travel_events` の追加
3. `session_debug_snapshots` の追加

この3点だけでも、
- 招待先の保持
- 遷移意図の保持
- デバッグ情報の退避

が実現でき、再構成の効果は大きい。
