# STELLARECORD ログ分析報告書

作成日: 2026-03-15

対象:
- ログ群: `UserTools/log-check/raw-log`
- 現行実装参照: `StellaRecord/src-tauri/src/analyze/db.rs` / `StellaRecord/src-tauri/src/analyze/mod.rs` / `StellaRecord/src-tauri/src/analyze/parser.rs`

調査対象ログの概要:
- 対象ファイル数: 55
- 合計サイズ: 71,539,148 bytes

## 第一章 現在のDB構成

現行の `STELLARECORDDB` は、コード上では以下の6テーブルと2ビューで構成されている。

### 1.1 app_sessions

ログファイル単位のセッション管理テーブル。

保持項目:
- `id`
- `log_filename`
- `vrchat_build`
- `my_user_id`
- `my_display_name`
- `start_time`
- `end_time`

実際の取得元:
- 行頭タイムスタンプ
- `User Authenticated: ...`
- `VRChat Build: ...`

### 1.2 world_visits

ワールド訪問履歴。

保持項目:
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

実際の取得元:
- `[Behaviour] Entering Room: ...`
- `[Behaviour] Joining wrld_xxx...`
- `[Behaviour] OnLeftRoom`

補足:
- `instance_id` はフルインスタンス文字列ではなく番号のみ
- `access_type` は `private/friends/hidden/public/group`
- `instance_owner` は `private/friends/hidden` などで埋まる `usr_xxx`

### 1.3 players

プレイヤーマスタ。

保持項目:
- `id`
- `user_id`
- `display_name`

実際の取得元:
- `[Behaviour] OnPlayerJoined 名前 (usr_xxx)`

### 1.4 player_visits

ワールド訪問中の同席履歴。

保持項目:
- `id`
- `visit_id`
- `player_id`
- `is_self`
- `join_time`
- `leave_time`

実際の取得元:
- `[Behaviour] OnPlayerJoined ...`
- `[Behaviour] OnPlayerLeft ...`
- `[Behaviour] Initialized PlayerAPI "..." is local`

補足:
- `UNIQUE(visit_id, player_id)` のため、同一ワールド内の再入室は現状1レコードに潰れる

### 1.5 video_playbacks

動画再生履歴。

保持項目:
- `id`
- `visit_id`
- `url`
- `timestamp`

実際の取得元:
- `Started video load for URL: ...`
- `Started video: ...`

補足:
- 誰がリクエストしたかは意図的に収集しない

### 1.6 notifications

通知受信履歴。

保持項目:
- `id`
- `session_id`
- `notif_id`
- `notif_type`
- `sender_user_id`
- `sender_username`
- `message`
- `created_at`
- `received_at`

実際の取得元:
- `Received Notification: <Notification ...>`

補足:
- `notif_type='group'` は除外
- `notif_id` で重複排除
- 通知詳細の `worldId` `worldName` は現状DBへ保存していない

### 1.7 ビュー

#### visit_summary
- ワールド訪問の滞在秒数
- 同席人数

#### player_stats
- プレイヤーごとの同席回数
- 初遭遇時刻
- 最終遭遇時刻

### 1.8 現状の性質

現行DBは、以下の用途に最適化されている。

- セッション単位の利用履歴把握
- ワールド訪問履歴の蓄積
- 同席プレイヤー集計
- 動画再生URLの記録
- 通知受信履歴の記録

逆に、以下は意図的または未実装で保持していない。

- 通知に含まれる `worldId` / `worldName`
- 自分や他人のアバター変更履歴
- 環境情報、ユーザー設定情報、音声デバイス情報
- 接続先決定の途中経路
- VRChat+ 状態や権限情報

## 第二章 分析結果

### 2.1 現行実装で実際に取れるもの

`raw-log` 全体で、現行実装が依存する主要パターンは十分に存在する。

確認件数:
- `User Authenticated:` 41件
- `[Behaviour] Entering Room:` 258件
- `[Behaviour] Joining wrld_` 254件
- `[Behaviour] OnLeftRoom` 221件
- `[Behaviour] OnPlayerJoined` 1502件
- `[Behaviour] OnPlayerLeft` 1428件
- `Initialized PlayerAPI` 1502件
- `Started video load for URL:` 67件
- `Started video: https://` 47件
- `Received Notification:` 348件

判断:
- セッション情報、ワールド訪問、同席者、動画再生、通知は十分に抽出可能
- ただし `Entering Room` 258件に対して `Joining wrld_` 254件のため、一部は現行ロジックで訪問確定できない可能性がある
- `OnPlayerJoined` 1502件に対して `OnPlayerLeft` 1428件の差分は、ログ末尾補完である程度吸収されるが、ログ途中切断では誤差が残り得る
- `Initialized PlayerAPI "..." is local` は存在するため `is_self` 判定は成立する

### 2.2 現行実装で取り切れていないが、ログ上は取得可能なもの

以下はログ上に明確なパターンがあり、DB拡張で取得可能。

#### A. 通知に含まれる合流先情報

例:
- `worldId=wrld_...:74409~private(...)~region(jp)`
- `worldName=SC-cLoset-`

確認件数:
- `worldId=wrld_` 50件
- `worldName=` 50件

現状:
- 通知本体は保存しているが、通知の遷移先ワールド情報を保存していない

価値:
- 招待通知の「どこへ呼ばれたか」を後から分析できる
- 通知受信と実際の移動先を比較できる

#### B. 遷移決定の途中経路

確認件数:
- `[Behaviour] Destination requested:` 324件
- `[Behaviour] Destination fetching:` 282件
- `[Behaviour] Destination set:` 282件
- `[Behaviour] Going to Home Location:` 96件

現状:
- 最終的な `world_visits` のみ保存

価値:
- 実際に入室しなかった遷移要求を分析できる
- ホーム移動、招待承諾、ワールド情報取得失敗などの途中状態を追える

#### C. プレイヤー参加完了イベント

確認件数:
- `[Behaviour] OnPlayerJoinComplete` 1501件

現状:
- `OnPlayerJoined` のみ使用

価値:
- プレイヤー表示名/参加確定時刻の精度補助
- `OnPlayerJoined` と `OnPlayerJoinComplete` の差分分析が可能

#### D. アバター名変更履歴

確認件数:
- `[Behaviour] Switching ` 2377件

現状:
- `avatar_changes` はコード上で廃止済み

価値:
- 同席者や自分のアバター変化を時系列で見られる

注意:
- 現行方針ではプライバシー理由で廃止済みであり、再導入は設計判断が必要

#### E. 環境情報・設定情報

確認件数:
- `[UserInfoLogger] Environment Info:` 48件
- `[UserInfoLogger] User Settings Info:` 48件
- `Get VRChat Subscription Details!` 67件
- `Fetched local user permissions` 64件
- `Got best network region:` 37件
- `Current UTC Time is:` 30件

ログから取得可能な代表項目:
- ストア種別
- 実行プラットフォーム
- OS
- CPU
- GPU
- メモリ
- XR Device
- 各種ユーザー設定
- VRChat+ 有効状態
- 選択リージョン/最適リージョン

価値:
- セッションごとの環境差異分析
- 不具合時の環境再現性向上

注意:
- ハードウェア・デバイス情報は個人性が高く、STELLARECORDの用途整理が必要

#### F. 音声入力デバイス情報

確認件数:
- `Microphones installed (` 254件
- `device name = '` 2794件

ログから取得可能な代表項目:
- デバイス名
- 最小/最大周波数
- 列挙時点のデバイス数

価値:
- 音声トラブル調査
- セッションごとの入力デバイス変化把握

注意:
- デバイス名は環境固有で、個人性が高い

### 2.3 取得は可能だが、STELLARECORDに入れるべきか慎重判断が必要なもの

以下はログにあるが、現状用途との整合を慎重に見るべきもの。

- アバター名変更履歴
- ハードウェア情報
- 音声入力デバイス名
- 詳細なユーザー設定全文
- URL 解決や外部取得の細かい内部状態

理由:
- プライバシー性が高い
- データ量増加が大きい
- 現行DBの主目的は「行動履歴と同席関係」であり、軸がぶれる

### 2.4 結論

現行ログ群は、現実装の取り込み対象については十分に成立する。

また、追加で価値が高い候補は次の順である。

1. 通知に含まれる `worldId` / `worldName`
2. `Destination requested/fetching/set` による遷移試行履歴
3. `OnPlayerJoinComplete` による参加確定補助
4. 必要ならセッション単位の環境サマリ

逆に、アバター変更履歴やデバイス情報は、取得可能ではあるが、現行方針では優先度を上げすぎない方がよい。

## 第三章 DBが更新できるならどんな構成になるか

方針としては、既存6テーブルを壊さず、用途が明確なものだけを追加する構成がよい。

### 3.1 最小拡張案

既存テーブルへの追加:

#### notifications への追加カラム
- `target_world_id TEXT`
- `target_world_name TEXT`
- `target_instance_id TEXT`
- `target_access_type TEXT`
- `target_instance_owner TEXT`
- `target_region TEXT`

効果:
- 招待通知の行先を1レコード内で完結して保持できる
- 既存通知機能との整合がよい

### 3.2 推奨拡張案

既存テーブルを維持しつつ、以下の新設を推奨する。

#### 1. travel_events

用途:
- 「実際に入室した」ではなく「どこへ行こうとしたか」を記録

想定カラム:
- `id`
- `session_id`
- `event_type` `requested/fetching/set/home`
- `world_id`
- `instance_id`
- `access_type`
- `instance_owner`
- `region`
- `world_name`
- `timestamp`
- `source_notif_id` nullable

#### 2. player_join_events

用途:
- `OnPlayerJoined` と `OnPlayerJoinComplete` を潰さず保持

想定カラム:
- `id`
- `visit_id`
- `player_id`
- `event_type` `joined/join_complete/left`
- `timestamp`

効果:
- 現行 `player_visits` はサマリ、こちらはイベント生ログ寄りにできる
- 同一ワールド再入室問題にも対応しやすい

#### 3. session_environment_summary

用途:
- 環境情報を全文ではなく、分析に必要なサマリのみ保存

想定カラム:
- `session_id`
- `store`
- `platform`
- `operating_system`
- `device_model`
- `processor_type`
- `graphics_device_name`
- `system_memory_mb`
- `graphics_memory_mb`
- `xr_device`
- `selected_network_region`
- `best_network_region`
- `subscription_active`

効果:
- 個別設定全文を保存せずに済む
- セッション分析に必要な環境差異だけを持てる

### 3.3 非推奨または要別機能化の案

以下はDB本体へ直接入れるより、別機能または明示オプトインが望ましい。

- `avatar_changes`
- `audio_input_devices`
- `user_settings_raw`
- `environment_info_raw`

理由:
- データ量が大きい
- プライバシー性が高い
- STELLARECORDの中核ユースケースから外れやすい

### 3.4 更新後の全体像

実運用を意識すると、以下の3層構造が扱いやすい。

#### 層1: サマリ
- `app_sessions`
- `world_visits`
- `players`
- `player_visits`
- `video_playbacks`
- `notifications`

#### 層2: イベント
- `travel_events`
- `player_join_events`

#### 層3: セッション補助情報
- `session_environment_summary`

この構成なら、
- 既存機能を壊さない
- 現在のログから取得できる有益情報を自然に追加できる
- プライバシー負荷の高い詳細データを本体DBへ過剰に持ち込まない

### 3.5 最終提案

優先順位としては次の順が妥当。

1. `notifications` に合流先ワールド情報を追加
2. `travel_events` を追加して遷移試行履歴を持つ
3. `player_join_events` を追加して参加イベントを生で持つ
4. 必要なら `session_environment_summary` を追加

この順なら、STELLARECORDの現在価値である「いつ、どこに行き、誰といたか」を壊さずに、ログから取れる情報を無理なく拡張できる。
