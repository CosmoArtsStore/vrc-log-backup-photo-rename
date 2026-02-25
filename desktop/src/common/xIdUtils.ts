/**
 * X（旧Twitter）ID / URL のパース・表示用ユーティリティ。
 * キャスト管理で @username 形式の表示と x.com リンクを生成する。
 */

/**
 * 入力文字列（URL または @username / username）から X のユーザー名を抽出する。
 * @returns ユーザー名。抽出できない場合は null
 */
export function parseXUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('@')) {
    const rest = trimmed.slice(1).trim();
    return rest ? rest : null;
  }

  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/([^/?#]+)/i);
  if (urlMatch) return urlMatch[1];

  if (trimmed.includes('/') || trimmed.includes('.') || trimmed.startsWith('http')) {
    return null;
  }

  return trimmed;
}

/**
 * ユーザー名から x.com のプロフィールURLを返す
 */
export function getXProfileUrl(username: string): string {
  const clean = username.trim();
  if (!clean) return 'https://x.com';
  return `https://x.com/${encodeURIComponent(clean)}`;
}

/**
 * VRCプロフURLかどうか判定し、ユーザーID（usr_xxxx）を抽出する。
 * vrc.game/users/usr_xxx または vrchat.com/home/user/usr_xxx 形式に対応。
 * usr_ の後に hex のみ、または UUID形式（usr_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）を許可。
 * @returns 抽出できたID、なければ null
 */
export function extractVrcUserIdFromUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const isVrcUrl = /vrc\.game|vrchat\.com/i.test(trimmed);
  if (!isVrcUrl) return null;
  const match = trimmed.match(/(?:vrc\.game\/users|vrchat\.com\/home\/user)\/(usr_[a-f0-9-]+)/i);
  if (match) return match[1];
  const altMatch = trimmed.match(/\/(usr_[a-f0-9-]+)/i);
  return altMatch ? altMatch[1] : null;
}

/**
 * URLがXのURLかどうかを判定する
 */
export function isXUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\//i.test(url.trim());
}

/**
 * URLがVRChatのURLかどうかを判定する
 */
export function isVrcUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.)?vrchat\.com\/home\/user\/usr_/i.test(url.trim());
}
