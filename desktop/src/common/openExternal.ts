/**
 * 外部リンクを規定ブラウザで開く。
 * Tauri 内なら openUrl（規定ブラウザ）、開発時ブラウザなら window.open。
 */

import { isTauri } from '@/tauri';

export async function openInDefaultBrowser(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) return;
  const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`;

  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(normalized);
  } else {
    window.open(normalized, '_blank', 'noopener,noreferrer');
  }
}
