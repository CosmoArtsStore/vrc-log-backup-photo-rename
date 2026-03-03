import struct
import os
import zlib

PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'

def parse_png_chunks(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()
    if not data.startswith(PNG_SIGNATURE):
        return None, "PNG シグネチャなし"
    chunks = []
    pos = 8
    while pos < len(data):
        if pos + 8 > len(data):
            break
        length = struct.unpack('>I', data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+length]
        chunks.append((chunk_type, chunk_data))
        pos += 12 + length
    return chunks, None

def parse_itxt(chunk_data):
    """iTXt チャンクをパース
    構造: keyword\0 compression_flag(1) compression_method(1) language_tag\0 translated_keyword\0 text
    """
    null_pos = chunk_data.find(b'\x00')
    if null_pos < 0:
        return None, None, None
    
    keyword = chunk_data[:null_pos].decode('latin-1')
    rest = chunk_data[null_pos+1:]
    
    compression_flag = rest[0]
    compression_method = rest[1]
    rest = rest[2:]
    
    # language_tag\0
    null_pos2 = rest.find(b'\x00')
    lang_tag = rest[:null_pos2].decode('latin-1')
    rest = rest[null_pos2+1:]
    
    # translated_keyword\0
    null_pos3 = rest.find(b'\x00')
    trans_kw = rest[:null_pos3].decode('utf-8', errors='replace')
    text_bytes = rest[null_pos3+1:]
    
    if compression_flag == 1:
        try:
            text_bytes = zlib.decompress(text_bytes)
        except:
            pass
    
    text = text_bytes.decode('utf-8', errors='replace')
    return keyword, lang_tag, text

def analyze_file(filepath):
    filename = os.path.basename(filepath)
    chunks, err = parse_png_chunks(filepath)
    
    lines = []
    lines.append("=" * 70)
    lines.append(f"ファイル: {filename}")
    lines.append("=" * 70)
    
    if err:
        lines.append(f"  エラー: {err}")
        return '\n'.join(lines)

    all_chunk_types = [ct.decode('ascii', errors='replace') for ct, _ in chunks]
    lines.append(f"  チャンク構成: {all_chunk_types}")
    lines.append("")

    for chunk_type, chunk_data in chunks:
        if chunk_type == b'vrCd':
            lines.append(f"  [vrCd] 撮影日時: {chunk_data.decode('utf-8', errors='replace')}")
        elif chunk_type == b'vrCw':
            lines.append(f"  [vrCw] ワールド名: {chunk_data.decode('utf-8', errors='replace')}")
        elif chunk_type == b'vrCp':
            lines.append(f"  [vrCp] 撮影者名: {chunk_data.decode('utf-8', errors='replace')}")
        elif chunk_type == b'vrCu':
            lines.append(f"  [vrCu] ユーザー名: {chunk_data.decode('utf-8', errors='replace')}")
        elif chunk_type == b'tEXt':
            parts = chunk_data.split(b'\x00', 1)
            key = parts[0].decode('latin-1')
            val = parts[1].decode('latin-1', errors='replace') if len(parts) > 1 else ''
            lines.append(f"  [tEXt] {key}:")
            lines.append(f"         {val}")
        elif chunk_type == b'iTXt':
            keyword, lang, text = parse_itxt(chunk_data)
            lines.append(f"  [iTXt] keyword: {keyword}  lang: {lang}")
            lines.append(f"  {'=' * 60}")
            lines.append(text)
            lines.append(f"  {'=' * 60}")

    lines.append("")
    return '\n'.join(lines)

target_dir = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\Alpheratz-Photo-debug"
files = [
    "VRChat_2026-02-03_05-16-06.914_2160x3840.png",
    "VRChat_2026-02-04_18-49-22.042_3840x2160.png",
    "VRChat_2026-02-08_21-30-30.296_3840x2160.png",
    "VRChat_2026-02-09_01-08-32.168_2160x3840.png",
    "VRChat_2026-02-09_21-58-44.701_2160x3840.png",
    "VRChat_2026-02-11_19-32-04.665_2160x3840.png",
    "VRChat_2026-02-15_18-32-37.933_2160x3840.png",
    "VRChat_2026-02-15_19-16-52.221_3840x2160.png",
    "VRChat_2026-02-15_20-07-46.572_2160x3840.png",
]

output_lines = ["VRChat PNG メタデータ完全解析結果", "解析日時: 2026-03-03 20:01", ""]

for fname in files:
    fpath = os.path.join(target_dir, fname)
    if os.path.exists(fpath):
        output_lines.append(analyze_file(fpath))
    else:
        output_lines.append(f"ファイル未発見: {fname}\n")

output_text = '\n'.join(output_lines)
print(output_text)

out_path = os.path.join(target_dir, "photoDebug.txt")
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(output_text)

print(f"\n→ {out_path} に書き出し完了")
