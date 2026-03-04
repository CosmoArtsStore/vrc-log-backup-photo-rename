use regex::Regex;
use once_cell::sync::Lazy;

/// タイムスタンプ（行頭）
pub static RE_TIME: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})").unwrap()
});

/// VRChatビルド番号
pub static RE_BUILD: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"VRChat Build: (.*)").unwrap()
});

/// ログイン認証（セッション開始時に1回だけ出現）
/// 例: "User Authenticated: 名前 (usr_xxxx)"
pub static RE_USER_AUTH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"User Authenticated: (.*?) \((usr_[a-f0-9\-]+)\)").unwrap()
});

/// ワールド名（Joiningの直前に出現する）
/// 例: "[Behaviour] Entering Room: ワールド名"
pub static RE_ENTERING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[Behaviour\] Entering Room: (.*)").unwrap()
});

/// ワールドJoin
/// 例: "[Behaviour] Joining wrld_xxx:74156~private(usr_xxx)~region(jp)"
/// cap1 = world_id, cap2 = instance_number, cap3 = access_raw, cap4 = region
pub static RE_JOINING: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\[Behaviour\] Joining (wrld_[^:]+)(?::(\d+))?~?((?:private|friends|hidden|public|group)[^~]*)(?:~region\(([^)]+)\))?"
    ).unwrap()
});

/// ルーム退室
pub static RE_LEFT_ROOM: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[Behaviour\] OnLeftRoom").unwrap()
});

/// プレイヤー入室
/// 例: "[Behaviour] OnPlayerJoined 名前 (usr_xxxx)"
pub static RE_PLAYER_JOIN: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[Behaviour\] OnPlayerJoined (.*?) \((usr_[a-f0-9\-]+)\)").unwrap()
});

/// プレイヤー退室
pub static RE_PLAYER_LEFT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[Behaviour\] OnPlayerLeft (.*?) \((usr_[a-f0-9\-]+)\)").unwrap()
});

/// ローカルプレイヤー判定（ワールド入室ごとに出現）
/// 例: "[Behaviour] Initialized PlayerAPI \"名前\" is local"
pub static RE_IS_LOCAL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local|remote)"#).unwrap()
});

/// 動画再生（USharpVideo — ユーザーが意図した原URL）
/// 例: "[USharpVideo] Started video load for URL: https://..., requested by 名前"
///   → URLのみ取得。「requested by」以降はプライバシー保護のため収集しない。
pub static RE_VIDEO: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video load for URL: (https?://[^,]+)"
    ).unwrap()
});

/// 動画再生 代替パターン（USharpVideo — 再生完了後）
/// 例: "[USharpVideo] Started video: https://..."
pub static RE_VIDEO_ALT: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video: (https?://\S+)"
    ).unwrap()
});

/// 通知受信
/// 例: "Received Notification: <Notification from username:名前, sender user id:usr_xxx to usr_yyy
///      of type: boop, id: not_xxx, created at: 02/27/2026 05:05:12 UTC, ..., message: "...">
/// cap1 = sender_username, cap2 = sender_user_id, cap3 = notif_type, cap4 = notif_id,
/// cap5 = created_at, cap6 = message
pub static RE_NOTIFICATION: Lazy<Regex> = Lazy::new(|| {
    Regex::new(
        r#"Received Notification: <Notification from username:([^,]*), sender user id:([^ ]*) to [^ ]+ of type: ([^,]+), id: (not_[a-f0-9\-]+), created at: ([^,]+),[^>]*message: "([^"]*)"\s*>"#
    ).unwrap()
});

/// usr_id 抽出（汎用）
pub static RE_USR: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\((usr_[^)]+)\)").unwrap()
});

/// アクセス種別とオーナーIDを解析する
/// 戻り値: (access_type: Option<String>, instance_owner: Option<String>)
pub fn parse_access_type(access_raw: &str) -> (Option<String>, Option<String>) {
    let lower = access_raw.to_lowercase();
    let access_type = if lower.starts_with("private") {
        Some("private".to_string())
    } else if lower.starts_with("friends") {
        Some("friends".to_string())
    } else if lower.starts_with("hidden") {
        Some("hidden".to_string())
    } else if lower.starts_with("public") {
        Some("public".to_string())
    } else if lower.starts_with("group") {
        Some("group".to_string())
    } else {
        None
    };

    let instance_owner = RE_USR
        .captures(access_raw)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());

    (access_type, instance_owner)
}

/// 通知タイプが収集対象かを判定する
/// - group: スキップ（量が多く文字化けしやすい）
/// - その他: 収集
pub fn is_collectible_notification(notif_type: &str) -> bool {
    !matches!(notif_type.trim(), "group")
}
