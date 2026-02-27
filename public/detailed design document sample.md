Alpheratz.exe 詳細設計書
起動時スキャン〜DB構築〜UI描画 全フロー
項目内容対象モジュールAlpheratz.exe設計対象起動時スキャン・Alpheratz.db構築・UI描画の全処理フローバージョン1.0.0技術スタックRust / Tauri v2 / React 18 / Vite / SQLite (rusqlite)目次
起動エントリポイントと呼び出し元の関係
DB初期化処理
スキャン処理の非同期起動
ScanService — 変数初期化と処理全体の流れ
Phase 1: フォルダスキャン
Phase 2: DB差分照合
Phase 3: タイムスタンプパースとワールド照合
Phase 4: サムネイル生成
Phase 5: Alpheratz.dbへの登録
フロントエンドへのデータ伝達
React層 — 状態管理とUI描画フロー
Virtual Scrollの仕組み
UIアニメーション仕様
写真詳細ポップアップフロー
メモ保存フロー
処理シーケンス概要（全体）
1. 起動エントリポイントと呼び出し元の関係
Alpheratz.exeはSTELLA_RECORD.exeとは独立した単体Tauriアプリケーションであり、STELLA_RECORDのPleiadesセクションにあるカードをクリックすることで別プロセスとして起動される。すなわち起動元はSTELLA_RECORD.exeだが、プロセス間通信は行わない。Alpheratz.exeは起動後、完全に自律して動作する。
Alpheratz.exeが起動すると、TauriのRustランタイムはまずsetupフックを実行する。このフックはアプリケーションウィンドウが表示される前に1回だけ呼ばれるライフサイクルフックであり、DBの初期化とアプリケーション全体で共有する状態（AppState）の登録が行われる。setupフックが正常に完了した後にウィンドウが表示され、Reactフロントエンドのレンダリングが始まる。
2. DB初期化処理
setupフック内で最初に行われるのがAlpheratzDbの初期化である。AlpheratzDbはAlpheratz.dbへのSQLite接続を保持する構造体であり、このタイミングでDBファイルへの接続確立とスキーマの作成が行われる。
スキーマ作成はCREATE TABLE IF NOT EXISTSで行うため、初回起動時はテーブルが作成され、2回目以降の起動ではDBが既存の状態のまま何も変更せずに通過する。
スキーマ作成の直前に必ずPRAGMA journal_mode = WALを発行する。これによりSQLiteがWrite-Ahead Loggingモードで動作し、Planetarium.exeがplanetarium.dbに書き込み処理を行っている最中であっても、AlpheratzがRead-Only接続でplanetarium.dbを参照する際にブロッキングが発生しない。このPRAGMAはAlpheratz.dbに対して設定するが、後述するplanetarium.dbへの接続時も同様にRead-Only接続の前にWALモードが有効であることを前提とする。
テーブル作成後、検索・フィルタリングのパフォーマンスを確保するため、timestampカラムとworld_nameカラムにそれぞれインデックスを作成する。
初期化が完了したAlpheratzDbはTauriのAppStateとしてDI（依存性注入）管理に登録される。これにより以降のTauriコマンドハンドラからスレッドセーフに参照できるようになる。
3. スキャン処理の非同期起動
setupフックの完了後、フロントエンドのReactアプリが描画される。ReactはDOMのマウント完了を検知するuseEffectフック（依存配列空）の中で、起動後1回だけTauriのinvokeAPIを通じてinitialize_scanコマンドをRust側に送信する。
initialize_scanコマンドはRust側でTauri非同期コマンドとして定義されており、受け取った瞬間にtauri::async_runtime::spawnを使って別の非同期タスクとしてスキャン処理全体を投入し、自身は即座にOkをフロントエンドに返す。
この設計によりinitialize_scanの呼び出しはノンブロッキングであり、フロントエンドはinvokeの完了を待たずに次の処理（ローディングUIの表示など）に移行できる。スキャンの進捗や完了はTauri Eventシステムを通じて非同期にフロントエンドへ通知される。
4. ScanService — 変数初期化と処理全体の流れ
スキャン処理の主体はScanServiceという構造体であり、AlpheratzDbの参照とAppHandleの参照を保持している。AppHandleはTauriのイベント送信に必要なオブジェクトである。
ScanService::run()が実行開始されると、最初に以下の変数が初期化される。
変数名型初期値用途folder_pathPathBufAlpheratzSetting.jsonのphotoFolderPathから構築スキャン対象フォルダのパスall_filesVec<PathBuf>空リストフォルダから収集した全VRC写真ファイルexisting_filenamesHashSet<String>空セットAlpheratz.dbに登録済みのファイル名集合new_filesVec<PathBuf>空リスト今回新規登録が必要なファイルprocessed_countusize0処理済みファイル数（プログレス通知用の分子）total_newusize0新規ファイルの総数（プログレス通知用の分母）変数初期化後、以下の順でPhaseが実行される。

Phase 1: フォルダスキャン → all_files を埋める
Phase 2: DB差分照合     → existing_filenames を取得し new_files を決定
         ↓ プログレス初期通知（0 / total_new）
Phase 3〜5: new_filesを1件ずつループ処理
   └ タイムスタンプパース → ワールド照合 → サムネイル生成 → DB登録 → プログレス通知
         ↓ 全件完了
完了イベント送信
5. Phase 1: フォルダスキャン
scan_folder()は指定フォルダを1階層だけ走査し（サブフォルダは対象外）、VRChat写真フォーマットに合致するファイルだけをall_filesに収集する。
VRChat写真フォーマットの判定は正規表現で行う。パターンはVRChat_YYYY-MM-DD_HH-MM-SS.mmm_WIDTHxHEIGHT.拡張子であり、拡張子はpng・jpg・jpegを許容する。フォルダ内の全エントリに対してこのパターンマッチを行い、一致したものだけを収集する。
収集後、all_filesはファイル名の文字列順でソートする。VRChat写真のファイル名はタイムスタンプを含む形式のため、ファイル名順ソートが撮影日時順ソートと一致する。
フォルダが存在しない場合はAppError::FolderNotFoundを返し、スキャン処理全体をエラー終了させてフロントエンドにscan:errorイベントを送信する。
6. Phase 2: DB差分照合
AlpheratzDbのget_existing_filenamesメソッド
ScanServiceはAlpheratzDbのget_existing_filenames()を呼び出す。このメソッドはAlpheratz.dbのphotosテーブルからphoto_filenameカラムのみをWHERE条件なしで全件SELECTし、結果をHashSetに収集して返す。
WHEREなしの全件取得だが、取得するカラムはphoto_filenameのみと最小限に絞っているため、レコード数が増えても転送量は少ない。
返却されたexisting_filenames（HashSet）とall_files（Vec）を突き合わせ、HashSetに存在しないファイルだけをnew_filesに収集する。HashSetのcontains操作はO(1)であるため、写真が数万枚規模になっても差分抽出の計算量は線形に保たれる。
new_filesの件数が確定した時点でtotal_newを設定し、プログレス初期通知（0件 / total_new件）をフロントエンドに送信する。total_newが0の場合（新規ファイルが存在しない場合）は、スキャン処理をスキップして即座に完了イベントを送信する。
7. Phase 3: タイムスタンプパースとワールド照合
タイムスタンプパース
新規ファイル1件ごとにparse_timestamp_from_filename()を呼び出す。ファイル名に含まれる日付・時刻部分を正規表現でキャプチャし、SQLite互換のYYYY-MM-DD HH:MM:SS.mmm形式の文字列として返す。パースに失敗した場合はAppError::TimestampParseErrorとして記録し、当該ファイルをワールド不明として処理を続行する（スキャン全体は中断しない）。

resolve_world_for_timestamp — planetarium.dbへのクエリ
resolve_world_for_timestamp()はplanetarium.dbに対してRead-Only接続を開き、ワールド照合クエリを発行する。
接続はSQLiteのOPEN_READ_ONLYフラグで開き、絶対に書き込みが発生しないことをOS側でも保証する。
発行するSELECTの概要は以下の通りである。

取得テーブル: world_visits
取得カラム: world_id、world_nameの2カラムのみ
WHERE条件（2つのAND）:条件1: world_visits.join_timeがタイムスタンプ以前であること（入室後であることの保証）
条件2: world_visits.leave_timeがNULLである、またはタイムスタンプ以降であることleave_timeがNULLになるケースはVRChatがクラッシュして退室ログが記録されなかった場合を指す。この場合、NULLを「無限大（まだ在室中）」として扱い、条件を緩和することでクラッシュ時撮影写真も照合可能にする
ORDER BY: join_timeの降順（より直近のJoinを優先）
LIMIT: 1件（最初の1件のみ取得）
クエリが1件も返さない場合（クエリ結果が0行）は照合失敗と判定し、world_idにNULL、world_nameに"ワールド不明"をセットしたレコードを構築する。DBアクセスエラーが発生した場合も同様にワールド不明として処理を続行し、エラーをlogに出力する。
8. Phase 4: サムネイル生成
generate_thumbnail()はimageクレートを使用してオリジナル写真を読み込み、サムネイルを生成してthumbnail_cache/ディレクトリに保存する。
サムネイルのファイル名はオリジナルファイル名.thumb.jpgとする（例: VRChat_2024-01-15_22-30-45.123_1920x1080.png.thumb.jpg）。生成前にこのパスの存在を確認し、すでにサムネイルが存在する場合は生成処理をスキップしてパスを返す。これはアプリ再起動時の再生成を防ぐためのガードである。
サイズは横幅360px固定で縦はアスペクト比を維持する。thumbnail()関数はLanczosフィルタを使用するため品質が高い。保存フォーマットはJPEGとしてファイルサイズを抑える。
サムネイル生成に失敗した場合（読み込み失敗・書き込み失敗）は、サムネイルなしとしてDB登録は続行する。フロントエンドはサムネイル取得失敗時にはフォールバックとしてプレースホルダー画像を表示する。
9. Phase 5: Alpheratz.dbへの登録
AlpheratzDbのinsert_photo()を呼び出す。このメソッドはPhotoRecord構造体（photo_filename・photo_path・world_id・world_name・timestamp・memoの6フィールドを持つ）を受け取り、photosテーブルへINSERTを行う。
INSERT文はINSERT OR IGNORE INTO photos形式とする。photo_filenameはPRIMARY KEYであるため、万が一二重処理が発生しても既存レコードを保護したままエラーとならずにスキップされる。
memoの初期値は空文字列""であり、後述のメモ保存フローでユーザーが入力するまで変更されない。
10. フロントエンドへのデータ伝達
プログレス通知（scan:progress イベント）
スキャン処理は1ファイルを処理するごとにTauri EventとしてフロントエンドへJSON形式のペイロードを送信する。ペイロードには処理済み件数（processed）・総件数（total）・直前に処理したファイルのワールド名（current_world）の3フィールドが含まれる。
フロントエンドはこのイベントをlistenして進捗バーとパーセンテージ表示をリアルタイム更新する。

完了通知（scan:completed イベント）
全件処理完了後またはエラー終了時にそれぞれscan:completedまたはscan:errorイベントを送信する。フロントエンドはscan:completedを受け取ったタイミングでget_photosコマンドを発行してカード一覧データを取得し、カードUIをレンダリングする。

get_photos コマンド（カード一覧の取得）
get_photosコマンドはフロントエンドから絞り込み条件を受け取り、Alpheratz.dbに対してSELECTを発行してJSON配列として返す。
取得テーブルはphotosテーブル1つのみ。取得カラムはphoto_filename・world_id・world_name・timestamp・memoの5カラム（photo_pathはフロントエンドには渡さない。画像表示はTauriのconvert_file_src APIを使用するためパスはRust側で処理する）。
絞り込み条件はフロントエンドから以下の3種類が送られてくる可能性がある。

時期指定: timestamp >= 開始日時 AND timestamp <= 終了日時
ワールド名テキスト検索: world_name LIKE '%キーワード%'
ワールド名プルダウン選択: world_name = '正確なワールド名'
3条件はそれぞれオプショナルであり、送られてきた条件のみをWHERE句に動的に追加する。ORDER BYはデフォルトでtimestamp DESC（新しい写真が先頭）とする。
結果はPhotoCardオブジェクトの配列としてシリアライズしてフロントエンドに返す。
11. React層 — 状態管理とUI描画フロー
状態変数の定義
ReactのルートコンポーネントであるApp.tsxが起動時に以下の状態変数をuseStateで管理する。
状態変数名型初期値用途scanStatus'idle' | 'scanning' | 'completed' | 'error''idle'スキャンフェーズの管理scanProgress{ processed: number, total: number }{ processed: 0, total: 0 }プログレスバーの表示値photosPhotoCard[][]カードUIに表示する写真レコード一覧filterConditionFilterCondition全フィールドnull絞り込み条件オブジェクトselectedPhotoPhotoCard | nullnull詳細ポップアップに表示する選択中の写真worldNameListstring[][]ワールド名プルダウンの選択肢一覧起動時の処理フロー
コンポーネントのマウント完了をuseEffect（依存配列空）が検知し、以下を順に実行する。

scanStatusを'scanning'に変更する（ローディング画面を表示するためのトリガー）
Tauri EventのListenerを2種類登録する（scan:progressとscan:completed）
initialize_scanコマンドをinvokeでRustに送信する
scan:progressイベントを受け取るたびにscanProgressを更新し、プログレスバーが動く。scan:completedイベントを受け取った時点でscanStatusを'completed'に変更し、続けてget_photosコマンドをinvokeする。get_photosの返却値（PhotoCard[]）をphotosにセットする。このphotosの更新がReactの再レンダリングをトリガーし、カードUIが画面に描画される。
12. Virtual Scrollの仕組み
カードUI一覧はreact-windowライブラリのFixedSizeGridまたはFixedSizeListコンポーネントで実装する。Virtual Scrollの本質は「全カードをDOMに描画しない」ことである。
具体的には、スクロール可能なコンテナの高さと各カードの高さ（固定値）から「現在の画面に見えているカードの範囲（開始インデックス〜終了インデックス）」を計算し、その範囲のカードだけをDOMに描画する。ユーザーがスクロールするとインデックスの範囲が再計算され、範囲外のカードはDOMから削除・範囲内のカードが新たにDOMに追加される。
photos配列全体（数万件）はReactのメモリ上に保持するが、DOM要素として実体化するのは常に画面内の20〜30件程度に限定される。これにより写真が数万枚規模になっても描画パフォーマンスが一定に保たれる。
各カードコンポーネントはサムネイル画像をTauriのconvertFileSrc()でWeb-accessible URLに変換して<img>タグのsrcにセットする。サムネイルキャッシュのパスはRust側から各PhotoCardオブジェクトに含めて渡す。
13. UIアニメーション仕様
スキャン中のローディング表示
scanStatusが'scanning'の間は、カードグリッドの領域に代わりスケルトンUIを表示する。スケルトンは実際のカードと同じサイズのグレーブロックが並んだプレースホルダーであり、@keyframesによるシマーアニメーション（左から右に光が流れるグラデーション）をCSSで付与する。プログレスバーはスケルトンの上部に配置し、widthプロパティをprocessed / total * 100%の値にCSSトランジション（transition: width 0.3s ease）でアニメートする。

カードの出現アニメーション
scan:completed後にphotosがセットされると、Virtual Scrollによってカードが順次DOMに追加される。各カードコンポーネントはマウント時にopacity: 0からopacity: 1へのCSSフェードインアニメーションを持つ。アニメーション時間は0.2sとし、スクロール中の再描画時にはtransitionを無効化してちらつきを防ぐ。

フィルタリング時のトランジション
絞り込み条件が変更されるとget_photosが再発行され、photosが新しい配列で更新される。この際、既存のカードリストはフェードアウトせずに即座に新しいリストに置き換える。フィルタリングはローカルのphotos配列を直接フィルタするのではなく、必ずRust側のDB検索を経由することで、将来的なページネーション拡張に対応できる構造とする。
14. 写真詳細ポップアップフロー
カードをクリックすると、クリックイベントハンドラが該当のPhotoCardオブジェクトをselectedPhotoステートにセットする。selectedPhotoがnull以外になるとReactの条件レンダリングによってモーダルオーバーレイコンポーネントがDOMにマウントされる。
モーダルはposition: fixedで画面全体を覆うオーバーレイとして実装し、マウント時にopacity: 0からopacity: 1へのフェードインアニメーション（0.25s ease）が走る。
モーダル内の写真表示はサムネイルではなくオリジナルファイルパスをTauriのconvertFileSrc()で変換したURLを使用する。オリジナル画像はモーダルが開いた時点で初めてロードされる（遅延ロード）ためサイズに関わらずカード一覧の描画に影響しない。ロード中はモーダル内にスピナーを表示する。
ワールド名をクリックするとopen_world_urlコマンドがinvokeされ、Rust側でTauriのtauri::api::shell::open()を使用してhttps://vrchat.com/home/world/{world_id}をOSのデフォルトブラウザで開く。world_idがNULL（ワールド不明）の場合はワールド名の表示をクリッカブルにせず、クリック不可のテキストとして描画する。
モーダルを閉じる操作はオーバーレイ背景クリック、またはCloseボタンクリックによってselectedPhotoをnullに戻す。フェードアウトアニメーション（0.2s ease）後にDOMからアンマウントされる。
15. メモ保存フロー
モーダル内にはテキストエリアが配置されており、開いた時点でselectedPhoto.memoの値をテキストエリアの初期値としてセットする。ユーザーがテキストエリアを編集するとReactのonChangeハンドラによってローカルのメモ用ステート変数（localMemo）が更新される。この変更はselectedPhotoやDBには即座に反映しない。
「保存」ボタンを押下したタイミングでsave_memoコマンドをinvokeする。コマンドのパラメータはphoto_filename（更新対象の特定キー）とmemo（新しいメモ内容）の2つである。
Rust側のsave_memoコマンドはAlpheratz.dbのphotosテーブルに対してUPDATE photos SET memo = :memo WHERE photo_filename = :filenameを発行する。更新に成功するとinvokeの返却値として成功フラグが返される。
フロントエンドは保存成功後にphotos配列の該当レコードのmemoフィールドをローカルで更新し、モーダルを再度開いたときに最新のメモが表示されるようにする。保存失敗時はモーダル内にエラーメッセージを表示し、DBの状態は変更されない。
16. 処理シーケンス概要（全体）
STELLA_RECORD.exe
    │  Pleiadesカードをクリック
    ↓
Alpheratz.exe 起動
    │
    ├─ [setup hook]
    │      AlpheratzDb::new()          → Alpheratz.dbへ接続
    │      AlpheratzDb::initialize_schema()
    │            PRAGMA journal_mode = WAL
    │            CREATE TABLE IF NOT EXISTS photos
    │            CREATE INDEX IF NOT EXISTS idx_photos_timestamp
    │            CREATE INDEX IF NOT EXISTS idx_photos_world_name
    │      AppStateに AlpheratzDb を登録
    │
    ├─ [Reactマウント]
    │      useEffect() 実行（初回のみ）
    │            scan:progress listener 登録
    │            scan:completed listener 登録
    │            invoke("initialize_scan") → Rust側に送信
    │      scanStatus = 'scanning'
    │      スケルトンUI + プログレスバー 表示
    │
    ├─ [Rust: initialize_scan コマンド]
    │      async_runtime::spawn() で ScanService::run() を非同期起動
    │      → フロントエンドに即 Ok を返す（ノンブロッキング）
    │
    ├─ [ScanService::run()]
    │      変数初期化（folder_path / all_files / existing_filenames 等）
    │
    │   [Phase 1: フォルダスキャン]
    │      scan_folder()
    │            フォルダ全走査
    │            VRC写真パターンマッチ
    │            ファイル名順ソート
    │            → all_files にセット
    │
    │   [Phase 2: DB差分照合]
    │      AlpheratzDb::get_existing_filenames()
    │            SELECT photo_filename FROM photos（全件・条件なし）
    │            → HashSet に収集 → existing_filenames にセット
    │      diff_files() で new_files を決定
    │      scan:progress イベント送信（0 / total_new）
    │
    │   [Phase 3〜5: new_filesをループ]
    │      ├─ parse_timestamp_from_filename()
    │      │      ファイル名の正規表現キャプチャ
    │      │      → "YYYY-MM-DD HH:MM:SS.mmm" 形式に変換
    │      │
    │      ├─ resolve_world_for_timestamp()
    │      │      planetarium.db に Read-Only 接続
    │      │      SELECT world_id, world_name FROM world_visits
    │      │            WHERE join_time <= :ts
    │      │              AND (leave_time IS NULL OR leave_time >= :ts)
    │      │            ORDER BY join_time DESC LIMIT 1
    │      │      → WorldVisit or None
    │      │
    │      ├─ generate_thumbnail()
    │      │      既存サムネイル確認（存在すればスキップ）
    │      │      image::open() → thumbnail(360,360) → JPEG保存
    │      │      → thumb_path を返す
    │      │
    │      ├─ AlpheratzDb::insert_photo()
    │      │      INSERT OR IGNORE INTO photos (...) VALUES (...)
    │      │
    │      └─ scan:progress イベント送信（processed / total）
    │
    │   scan:completed イベント送信
    │
    ├─ [React: scan:completed 受信]
    │      scanStatus = 'completed'
    │      invoke("get_photos", filterCondition) → Rust側に送信
    │            SELECT photo_filename, world_id, world_name, timestamp, memo
    │            FROM photos
    │            WHERE [絞り込み条件を動的構築]
    │            ORDER BY timestamp DESC
    │            → PhotoCard[] をJSON配列で返却
    │      photos ステートに結果をセット
    │      Virtual Scroll カードグリッド 描画
    │            各カード: サムネイルをconvertFileSrc()で表示
    │
    └─ [インタラクション]
           カードクリック
                selectedPhoto にセット
                モーダルフェードイン
                オリジナル画像を遅延ロード
                ワールド名クリック → invoke("open_world_url") → OS既定ブラウザで開く
                メモ入力 → localMemo 更新
                保存ボタン → invoke("save_memo")
                              UPDATE photos SET memo = :memo WHERE photo_filename = :key
                              成功 → photos 配列内の該当レコードのmemo更新
付記: 未確定事項との関係
本設計書はplanetarium.dbのスキーマが§6.4（world_visits: world_id・world_name・join_time・leave_time）として確定していることを前提とする。スキーマが変更された場合、§7のresolve_world_for_timestamp()のSELECト対象カラム名および結合ロジックを更新すること。
