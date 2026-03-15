use regex::Regex;
use std::sync::LazyLock;

fn compile_regex(pattern: &str, name: &str) -> Regex {
    Regex::new(pattern)
        // Intentional: these regexes are static invariants; startup should fail loudly if broken.
        .unwrap_or_else(|err| panic!("invalid regex {name}: {err}"))
}

/// タイムスタンプ（行頭）
pub static RE_TIME: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})", "RE_TIME"));

/// VRChatビルド番号
pub static RE_BUILD: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"VRChat Build: (.*)", "RE_BUILD"));

/// ログイン認証（セッション開始時に1回だけ出現）
/// 例: "User Authenticated: 名前 (usr_xxxx)"
pub static RE_USER_AUTH: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"User Authenticated: (.*?) \((usr_[a-f0-9\-]+)\)",
        "RE_USER_AUTH",
    )
});

/// ワールド名（Joiningの直前に出現する）
/// 例: "[Behaviour] Entering Room: ワールド名"
pub static RE_ENTERING: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"\[Behaviour\] Entering Room: (.*)", "RE_ENTERING"));

/// ワールドJoin
/// 例: "[Behaviour] Joining wrld_xxx:74156~private(usr_xxx)~region(jp)"
/// cap1 = world_id, cap2 = instance_number, cap3 = access_raw, cap4 = region
pub static RE_JOINING: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] Joining (wrld_[^:]+)(?::(\d+))?~?((?:private|friends|hidden|public|group)[^~]*)(?:~region\(([^)]+)\))?",
        "RE_JOINING",
    )
});

/// ルーム退室
pub static RE_LEFT_ROOM: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"\[Behaviour\] OnLeftRoom", "RE_LEFT_ROOM"));

/// プレイヤー入室
/// 例: "[Behaviour] OnPlayerJoined 名前 (usr_xxxx)"
pub static RE_PLAYER_JOIN: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] OnPlayerJoined (.*?) \((usr_[a-f0-9\-]+)\)",
        "RE_PLAYER_JOIN",
    )
});

/// プレイヤー退室
pub static RE_PLAYER_LEFT: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] OnPlayerLeft (.*?) \((usr_[a-f0-9\-]+)\)",
        "RE_PLAYER_LEFT",
    )
});

/// ローカルプレイヤー判定（ワールド入室ごとに出現）
/// 例: "[Behaviour] Initialized PlayerAPI \"名前\" is local"
pub static RE_IS_LOCAL: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r#"\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local|remote)"#,
        "RE_IS_LOCAL",
    )
});

/// 動画再生（USharpVideo — ユーザーが意図した原URL）
/// 例: "[USharpVideo] Started video load for URL: https://..., requested by 名前"
///   → URLのみ取得。「requested by」以降はプライバシー保護のため収集しない。
pub static RE_VIDEO: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video load for URL: (https?://[^,]+)",
        "RE_VIDEO",
    )
});

/// 動画再生 代替パターン（USharpVideo — 再生完了後）
/// 例: "[USharpVideo] Started video: https://..."
pub static RE_VIDEO_ALT: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video: (https?://\S+)",
        "RE_VIDEO_ALT",
    )
});

/// 通知受信
/// 例: "Received Notification: <Notification from username:名前, sender user id:usr_xxx to usr_yyy
///      of type: boop, id: not_xxx, created at: 02/27/2026 05:05:12 UTC, ..., message: "...">
/// cap1 = sender_username, cap2 = sender_user_id, cap3 = notif_type, cap4 = notif_id,
/// cap5 = created_at, cap6 = message
pub static RE_NOTIFICATION: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r#"Received Notification: <Notification from username:([^,]*), sender user id:([^ ]*) to [^ ]+ of type: ([^,]+), id: (not_[a-f0-9\-]+), created at: ([^,]+),[^>]*message: "([^"]*)"\s*>"#,
        "RE_NOTIFICATION",
    )
});

pub static RE_NOTIFICATION_WORLD_ID: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(r"worldId=(wrld_[^,}]+)", "RE_NOTIFICATION_WORLD_ID")
});

pub static RE_NOTIFICATION_WORLD_NAME: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(r"worldName=([^,}]+)", "RE_NOTIFICATION_WORLD_NAME")
});

pub static RE_DESTINATION_EVENT: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] Destination (requested|fetching|set): (wrld_[^\s]+)",
        "RE_DESTINATION_EVENT",
    )
});

pub static RE_GOING_HOME: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] Going to Home Location: (wrld_[^\s]+)",
        "RE_GOING_HOME",
    )
});

pub static RE_PLAYER_JOIN_COMPLETE: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] OnPlayerJoinComplete (.+)",
        "RE_PLAYER_JOIN_COMPLETE",
    )
});

pub static RE_ENVIRONMENT_LINE: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(r"^\s{4}([^:]+):\s*(.*)$", "RE_ENVIRONMENT_LINE")
});

pub static RE_DEVICE_LINE: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"^-- \[(\d+)\] device name = '([^']+)' min/max freq = (\d+) / (\d+)$",
        "RE_DEVICE_LINE",
    )
});

pub static RE_SUBSCRIPTION_STATUS: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"Get VRChat Subscription Details! Subscription Id:([^ ]*) active:(True|False) desc:(.*)",
        "RE_SUBSCRIPTION_STATUS",
    )
});

pub static RE_BEST_REGION: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"\[Behaviour\] Got best network region: (.+)",
        "RE_BEST_REGION",
    )
});

pub static RE_CURRENT_UTC: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"Current UTC Time is: ([^,]+), sync took ([^ ]+)s",
        "RE_CURRENT_UTC",
    )
});

/// usr_id 抽出（汎用）
pub static RE_USR: LazyLock<Regex> = LazyLock::new(|| compile_regex(r"\((usr_[^)]+)\)", "RE_USR"));

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

#[derive(Clone, Default)]
pub struct ParsedLocation {
    pub world_id: Option<String>,
    pub instance_id: Option<String>,
    pub access_type: Option<String>,
    pub instance_owner: Option<String>,
    pub region: Option<String>,
}

pub fn parse_location(location: &str) -> ParsedLocation {
    let trimmed = location.trim();
    let Some(world_id_raw) = trimmed.strip_prefix("wrld_") else {
        return ParsedLocation::default();
    };
    let rebuilt = format!("wrld_{}", world_id_raw);
    let Some((world_id, tail)) = rebuilt.split_once(':') else {
        return ParsedLocation {
            world_id: Some(rebuilt),
            ..ParsedLocation::default()
        };
    };

    let mut result = ParsedLocation {
        world_id: Some(world_id.to_string()),
        ..ParsedLocation::default()
    };

    let mut parts = tail.split('~');
    if let Some(instance_id) = parts.next() {
        result.instance_id = Some(instance_id.to_string());
    }

    if let Some(access_raw) = parts.next() {
        let (access_type, instance_owner) = parse_access_type(access_raw);
        result.access_type = access_type;
        result.instance_owner = instance_owner;
    }

    for part in parts {
        if let Some(region) = part
            .strip_prefix("region(")
            .and_then(|value| value.strip_suffix(')'))
        {
            result.region = Some(region.to_string());
        }
    }

    result
}
