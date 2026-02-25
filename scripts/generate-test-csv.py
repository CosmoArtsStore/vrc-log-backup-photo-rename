"""
テスト用 CSV 生成スクリプト
出席中キャスト15名に対して、200名の応募リストを各ロジック向けに生成する。

生成ファイル:
  1. stub-import-basic.csv      - 基本テンプレート（M001-M004 汎用、200名）
  2. test-200-ng.csv            - NG/要注意人物テスト用（NG一致ユーザー含む）
  3. test-200-group-10x20.csv   - M005 グループマッチング用（10グループ×20名）
  4. test-200-multiple-5x3.csv  - M006 複数マッチング用（5名/テーブル, 3キャスト/ローテ）
"""

import csv
import random
import os

random.seed(42)

# ─── 出席中キャスト（db.json の is_present: true） ───
PRESENT_CASTS = [
    "柘榴_ざくろ", "ちるちる", "なゆたの", "なんこつ", "ニャンツァー",
    "ヌウア", "ばじばじ", "ばも", "ふぃり", "ぷりも",
    "めび", "moku", "るびちゃ", "れあちーず", "Diefuku",
]

# ─── NG エントリ（sample-casts.json と完全一致） ───
# cast_name -> [{ username, accountId? }]
# sample-casts.json の ng_entries をそのまま転写。テストCSVと整合させるための参照。
NG_MAP = {
    # 欠席キャスト
    "こなちゃ": [{"username": "テストユーザー", "accountId": "test_user_01"}],
    "しらす": [{"username": "灰原あい"}],  # accountId なし
    "すくいど": [{"username": "零", "accountId": "rei_zero_x"}],
    "せれにた": [{"username": "遠藤りつ"}],
    "そいる": [{"username": "城之内ジョー"}],
    "そに": [{"username": "四条ゆう", "accountId": "shijo_yuu"}],
    "なりむ": [{"username": "闇影ゆかり", "accountId": "yamikage_y"}],
    "ふぇる": [{"username": "水野ゆき", "accountId": "mizuno_yuki"}],
    # 出席キャスト
    "柘榴_ざくろ": [{"username": "闇影ゆかり", "accountId": "yamikage_y"}],
    "ちるちる": [{"username": "荒木まこと", "accountId": "araki_m99"}],
    "なんこつ": [{"username": "闇影ゆかり", "accountId": "yamikage_y"}],
    "ニャンツァー": [
        {"username": "闇影ゆかり", "accountId": "yamikage_y"},
        {"username": "黒崎翔太", "accountId": "kurosaki_s"},
        {"username": "蒼井はるか"},  # accountId なし → username-only テスト
    ],
    "ばも": [{"username": "水野ゆき", "accountId": "mizuno_yuki"}],
    "ふぃり": [{"username": "水野ゆき", "accountId": "mizuno_yuki"}],
    "めび": [{"username": "佐伯りん", "accountId": "saeki_rin"}],
}

# ─── 要注意人物 自動登録テスト設計 ───
# 闇影ゆかり (yamikage_y): 柘榴_ざくろ + なんこつ + ニャンツァー + なりむ(欠) = 4キャスト
# 水野ゆき   (mizuno_yuki): ばも + ふぃり + ふぇる(欠) = 3キャスト
# 黒崎翔太   (kurosaki_s):  ニャンツァー = 1キャスト
# 荒木まこと (araki_m99):   ちるちる = 1キャスト
# 蒼井はるか (accountIdなし): ニャンツァー = 1キャスト (username-only NG)
# 佐伯りん   (saeki_rin):   めび = 1キャスト

# ─── 名前プール ───
LAST_NAMES = [
    "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
    "吉田", "山田", "佐々木", "松本", "井上", "木村", "林", "清水", "山口", "阿部",
    "池田", "橋本", "石川", "前田", "藤田", "小川", "後藤", "岡田", "長谷川", "村上",
    "近藤", "石井", "斎藤", "坂本", "遠藤", "藤井", "青木", "西村", "福田", "太田",
    "三浦", "藤原", "岡本", "松田", "中川", "竹内", "金子", "和田", "中野", "原田",
    "河野", "小野", "田村", "上田", "新井", "丸山", "大野", "高木", "菅原", "酒井",
    "宮本", "安藤", "馬場", "野口", "柴田", "島田", "渡部", "野村", "森田", "工藤",
]

FIRST_NAMES = [
    "ほのか", "ひまり", "そうた", "しょうた", "ゆうな", "ことね", "みなと", "けんた",
    "そうま", "はるか", "そら", "ゆい", "りく", "さくら", "あやね", "こうき",
    "みさき", "あいり", "たくみ", "こうへい", "かなで", "のぞみ", "ましろ", "あかり",
    "れいな", "だいき", "つむぎ", "めい", "ふうか", "りお", "ひなた", "しゅん",
    "みお", "みずき", "たいが", "ゆうき", "いつき", "ともや", "れん", "あおい",
    "ちひろ", "こはる", "ななみ", "さら", "はると", "はやと", "かいと", "まい",
    "けい", "るい", "せい", "りょう", "ゆう", "なお", "まさき", "ゆうと",
]

def gen_x_id(idx: int) -> str:
    """ユニークな X ID を生成"""
    tags = ["vrc", "game", "play", "star", "moon", "sun", "sky", "cat", "fox", "bear"]
    tag = tags[idx % len(tags)]
    return f"@{tag}_{idx:04d}"


def gen_user(idx: int, cast_pool: list[str], force_name: str | None = None) -> dict:
    """1ユーザー分のデータを生成"""
    if force_name:
        name = force_name
    else:
        last = LAST_NAMES[idx % len(LAST_NAMES)]
        first = FIRST_NAMES[idx % len(FIRST_NAMES)]
        name = f"{last}{first}"

    x_id = gen_x_id(idx)

    # 希望キャスト: 1〜3名ランダム
    n_hopes = random.choices([1, 2, 3], weights=[20, 40, 40])[0]
    hopes = random.sample(cast_pool, min(n_hopes, len(cast_pool)))
    cast1 = hopes[0] if len(hopes) > 0 else ""
    cast2 = hopes[1] if len(hopes) > 1 else ""
    cast3 = hopes[2] if len(hopes) > 2 else ""

    return {
        "ユーザー名": name,
        "アカウントID": x_id,
        "希望キャスト１": cast1,
        "希望キャスト２": cast2,
        "希望キャスト３": cast3,
    }


def write_csv(path: str, rows: list[dict]):
    """CSV ファイルを書き出す"""
    fieldnames = ["ユーザー名", "アカウントID", "希望キャスト１", "希望キャスト２", "希望キャスト３"]
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"  OK {path} ({len(rows)} rows)")


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "desktop", "public")
    os.makedirs(out_dir, exist_ok=True)

    # ──────────────────────────────────────────
    # 1. stub-import-basic.csv（M001-M004 汎用・200名）
    # ──────────────────────────────────────────
    print("\n[1] stub-import-basic.csv (M001-M004 汎用)")
    rows_basic = [gen_user(i, PRESENT_CASTS) for i in range(200)]
    write_csv(os.path.join(out_dir, "stub-import-basic.csv"), rows_basic)

    # ──────────────────────────────────────────
    # 2. test-200-ng.csv（NG / 要注意人物テスト）
    #    - 一部ユーザーが NG エントリの username と一致
    #    - "tv" は 3 キャスト（ばも, ふぇる, ふぃり）で NG → caution auto-register
    #    - "v" は 2 キャスト（なりむ, なんこつ）で NG
    # ──────────────────────────────────────────
    print("\n[2] test-200-ng.csv (NG/要注意人物テスト)")
    # NG 対象ユーザー: sample-casts.json の ng_entries と完全整合
    # username と accountId（X ID）がNGエントリと一致する応募者として作成
    ng_inject = [
        # ── 要注意人物テスト (caution auto-register) ──────────────
        # "闇影ゆかり" (@yamikage_y):
        #   柘榴_ざくろ(出) + なんこつ(出) + ニャンツァー(出) + なりむ(欠) = 4キャスト
        #   → caution threshold ≥2 で自動登録される
        #   NG対象キャストを希望に入れてNG除外もテスト
        {"name": "闇影ゆかり", "x_id": "@yamikage_y",
         "casts": ["柘榴_ざくろ", "なんこつ", "ニャンツァー"]},

        # "水野ゆき" (@mizuno_yuki):
        #   ばも(出) + ふぃり(出) + ふぇる(欠) = 3キャスト
        #   → caution threshold ≥2 で自動登録される
        {"name": "水野ゆき", "x_id": "@mizuno_yuki",
         "casts": ["ばも", "ふぃり", "なゆたの"]},

        # ── NG 除外テスト (matching exclusion) ─────────────────
        # "荒木まこと" (@araki_m99): ちるちる(出) のNG → ちるちるを希望1に
        {"name": "荒木まこと", "x_id": "@araki_m99",
         "casts": ["ちるちる", "ヌウア", "Diefuku"]},

        # "黒崎翔太" (@kurosaki_s): ニャンツァー(出) のNG → ニャンツァーを希望1に
        {"name": "黒崎翔太", "x_id": "@kurosaki_s",
         "casts": ["ニャンツァー", "moku", "ばじばじ"]},

        # "佐伯りん" (@saeki_rin): めび(出) のNG → めびを希望1に
        {"name": "佐伯りん", "x_id": "@saeki_rin",
         "casts": ["めび", "ぷりも", "るびちゃ"]},

        # ── username-only NGエントリテスト ──────────────────
        # "蒼井はるか": ニャンツァーのNG (accountId なしエントリ)
        #   → ngJudgmentType=username/either では NG, accountId モードでは NG にならない
        {"name": "蒼井はるか", "x_id": "@aoi_haruka_v",
         "casts": ["ニャンツァー", "れあちーず", "moku"]},

        # ── 欠席キャストのNG（マッチングに影響しない確認用） ────────
        # "テストユーザー" (@test_user_01): こなちゃ(欠) のNG → 出席キャストのみ希望
        {"name": "テストユーザー", "x_id": "@test_user_01",
         "casts": ["ばも", "ちるちる", ""]},

        # "灰原あい": しらす(欠) のNG (accountId なしエントリ)
        {"name": "灰原あい", "x_id": "@haibara_ai",
         "casts": ["なゆたの", "moku", ""]},

        # "零" (@rei_zero_x): すくいど(欠) のNG
        {"name": "零", "x_id": "@rei_zero_x",
         "casts": ["めび", "ぷりも", ""]},

        # ── accountId 一致テスト ─────────────────────
        # 名前が NG エントリと違うが accountId は一致
        # → ngJudgmentType=accountId/either では NG, username モードでは NG にならない
        {"name": "偽名ユーザーA", "x_id": "@yamikage_y",
         "casts": ["柘榴_ざくろ", "なんこつ", "れあちーず"]},

        # 名前が NG エントリと一致するが accountId は不一致
        # → ngJudgmentType=username/either では NG, accountId モードでは NG にならない
        {"name": "闇影ゆかり", "x_id": "@different_id_999",
         "casts": ["ニャンツァー", "Diefuku", "ぷりも"]},
    ]

    rows_ng = []
    # 先頭 NG 対象ユーザー（意図的キャスト指定 + 実際のNG情報と一致）
    for inj in ng_inject:
        rows_ng.append({
            "ユーザー名": inj["name"],
            "アカウントID": inj["x_id"],
            "希望キャスト１": inj["casts"][0] if len(inj["casts"]) > 0 else "",
            "希望キャスト２": inj["casts"][1] if len(inj["casts"]) > 1 else "",
            "希望キャスト３": inj["casts"][2] if len(inj["casts"]) > 2 else "",
        })

    # 残りは通常ユーザー（idx をオフセットして名前被りを避ける）
    ng_count = len(ng_inject)
    for i in range(ng_count, 200):
        rows_ng.append(gen_user(i + 500, PRESENT_CASTS))

    write_csv(os.path.join(out_dir, "test-200-ng.csv"), rows_ng)

    # ──────────────────────────────────────────
    # 3. test-200-group-10x20.csv（M005 グループマッチング）
    #    200名 = 10グループ × 20名/グループ
    #    希望キャストは均等分布（偏り少なめ）
    # ──────────────────────────────────────────
    print("\n[3] test-200-group-10x20.csv (M005 グループ 10×20)")
    rows_group = []
    for i in range(200):
        user = gen_user(i + 1000, PRESENT_CASTS)
        rows_group.append(user)
    write_csv(os.path.join(out_dir, "test-200-group-10x20.csv"), rows_group)

    # ──────────────────────────────────────────
    # 4. test-200-multiple-5x3.csv（M006 複数マッチング）
    #    200名 ÷ 5名/テーブル = 40テーブル
    #    15キャスト ÷ 3キャスト/ローテ = 5ユニット
    # ──────────────────────────────────────────
    print("\n[4] test-200-multiple-5x3.csv (M006 複数 5名/table, 3cast/rot)")
    rows_multi = []
    for i in range(200):
        user = gen_user(i + 2000, PRESENT_CASTS)
        rows_multi.append(user)
    write_csv(os.path.join(out_dir, "test-200-multiple-5x3.csv"), rows_multi)

    # ──────────────────────────────────────────
    # 5. test-120-group-6x20.csv（M005 小規模テスト）
    #    120名 = 6グループ × 20名
    # ──────────────────────────────────────────
    print("\n[5] test-120-group-6x20.csv (M005 グループ 6×20)")
    rows_group2 = []
    for i in range(120):
        user = gen_user(i + 3000, PRESENT_CASTS)
        rows_group2.append(user)
    write_csv(os.path.join(out_dir, "test-120-group-6x20.csv"), rows_group2)

    # ──────────────────────────────────────────
    # 6. test-60-multiple-4x3.csv（M006 小規模テスト）
    #    60名 ÷ 4名/テーブル = 15テーブル
    #    15キャスト ÷ 5キャスト/ローテ = 3ユニット
    # ──────────────────────────────────────────
    print("\n[6] test-60-multiple-4x3.csv (M006 複数 4名/table, 5cast/rot)")
    rows_multi2 = []
    for i in range(60):
        user = gen_user(i + 4000, PRESENT_CASTS)
        rows_multi2.append(user)
    write_csv(os.path.join(out_dir, "test-60-multiple-4x3.csv"), rows_multi2)

    # ──────────────────────────────────────────
    # 7. stub-import-checkbox.csv（チェックボックス形式・200名）
    #    希望キャストがカンマ区切り1列
    # ──────────────────────────────────────────
    print("\n[7] stub-import-checkbox.csv (チェックボックス形式)")
    fieldnames_cb = ["ユーザー名", "アカウントID", "希望キャスト"]
    rows_cb = []
    for i in range(200):
        last = LAST_NAMES[(i + 300) % len(LAST_NAMES)]
        first = FIRST_NAMES[(i + 300) % len(FIRST_NAMES)]
        name = f"{last}{first}"
        x_id = gen_x_id(i + 5000)
        n_hopes = random.choices([1, 2, 3, 4], weights=[15, 35, 35, 15])[0]
        hopes = random.sample(PRESENT_CASTS, min(n_hopes, len(PRESENT_CASTS)))
        rows_cb.append({
            "ユーザー名": name,
            "アカウントID": x_id,
            "希望キャスト": ",".join(hopes),
        })
    cb_path = os.path.join(out_dir, "stub-import-checkbox.csv")
    with open(cb_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames_cb)
        writer.writeheader()
        writer.writerows(rows_cb)
    print(f"  OK {cb_path} ({len(rows_cb)} rows)")

    print("\n=== 完了 ===")
    print(f"出席キャスト: {len(PRESENT_CASTS)}名")
    print(f"NG エントリを持つキャスト: {len([c for c, ng in NG_MAP.items() if ng])}名")
    print("テスト設定の例:")
    print("  M001-M004: stub-import-basic.csv (200名)")
    print("  M005: test-200-group-10x20.csv (10グループ×20名, ローテ3)")
    print("       test-120-group-6x20.csv (6グループ×20名, ローテ3)")
    print("  M006: test-200-multiple-5x3.csv (5名/テーブル, 3キャスト/ローテ)")
    print("       test-60-multiple-4x3.csv (4名/テーブル, 5キャスト/ローテ)")
    print("  NG: test-200-ng.csv (NG一致10名 + 通常190名)")


if __name__ == "__main__":
    main()
