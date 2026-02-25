/**
 * CSV/TSV ダウンロード・バックアップ用。
 * 完全ローカル用（API 不要）。
 */

function escapeCsvCell(value: string | number): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** TSV用: セル内のタブ・改行をスペースに置換 */
function tsvCell(value: string | number): string {
  return String(value ?? '').replace(/\t/g, ' ').replace(/[\r\n]+/g, ' ').trim();
}

/**
 * 二次元配列を CSV 文字列にし、指定ファイル名でダウンロードする。
 */
export function downloadCsv(rows: (string | number)[][], filename: string): void {
  const csvLine = (row: (string | number)[]) => row.map(escapeCsvCell).join(',');
  const body = rows.map(csvLine).join('\r\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 二次元配列を TSV 文字列にする（UTF-8 BOMなし）。バックアップ・ダウンロード用。
 */
export function buildTsvContent(rows: (string | number)[][]): string {
  const line = (row: (string | number)[]) => row.map(tsvCell).join('\t');
  return rows.map(line).join('\r\n');
}

/**
 * TSV を指定ファイル名でダウンロードする（UTF-8 BOMなし）。
 */
export function downloadTsv(rows: (string | number)[][], filename: string): void {
  const body = buildTsvContent(rows);
  const blob = new Blob([body], { type: 'text/tab-separated-values;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.tsv') ? filename : `${filename}.tsv`;
  a.click();
  URL.revokeObjectURL(url);
}
