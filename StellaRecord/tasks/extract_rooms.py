import os

# 設定
input_dir = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\log-check\raw-log"
output_file = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\log-check\logRoad.txt"

all_lines = []

print(f"Reading all files from {input_dir}...")
# 全ログファイルを読み込み、一切の加工をせずにリストに格納
for filename in os.listdir(input_dir):
    if filename.endswith(".txt"):
        filepath = os.path.join(input_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                # readlines()で改行を含めて保持
                lines = f.readlines()
                all_lines.extend(lines)
        except Exception as e:
            print(f"Error reading {filename}: {e}")

print(f"Total lines read: {len(all_lines)}")

# 50音順（文字コード順）で「そのまま」ソート
print("Sorting lines raw...")
all_lines.sort()

# 重複排除（整理）
print("Removing duplicates...")
final_lines = []
if all_lines:
    prev = None
    for line in all_lines:
        # 改行コードの差異を無視して比較するために strip したものもチェックするが、保存は生データ
        if line != prev:
            final_lines.append(line)
            prev = line

print(f"Final unique lines: {len(final_lines)}")

# ファイル出力
print(f"Writing results to {output_file}...")
with open(output_file, 'w', encoding='utf-8') as f:
    for line in final_lines:
        f.write(line)

print("Done. logRoad.txt created with raw sorted lines.")
