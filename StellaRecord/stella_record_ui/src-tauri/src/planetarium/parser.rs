use regex::Regex;
use once_cell::sync::Lazy;

pub static RE_TIME: Lazy<Regex> = Lazy::new(|| Regex::new(r"^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})").unwrap());
pub static RE_USER_AUTH: Lazy<Regex> = Lazy::new(|| Regex::new(r"User Authenticated: (.*?) \((usr_.*?)\)").unwrap());
pub static RE_BUILD: Lazy<Regex> = Lazy::new(|| Regex::new(r"VRChat Build: (.*)").unwrap());
pub static RE_ENTERING: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[Behaviour\] Entering Room: (.*)").unwrap());
pub static RE_JOINING: Lazy<Regex> = Lazy::new(|| Regex::new(
    r"\[Behaviour\] Joining (wrld_[^:]+)(?::(\d+))?~?((?:private|friends|hidden|public|group)[^~]*)(?:~region\(([^)]+)\))?"
).unwrap());
pub static RE_LEFT_ROOM: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[Behaviour\] OnLeftRoom").unwrap());
pub static RE_PLAYER_JOIN: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[Behaviour\] OnPlayerJoined (.*?) \((usr_.*?)\)").unwrap());
pub static RE_PLAYER_LEFT: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[Behaviour\] OnPlayerLeft (.*?) \((usr_.*?)\)").unwrap());
pub static RE_IS_LOCAL: Lazy<Regex> = Lazy::new(|| Regex::new(r#"\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local|remote)"#).unwrap());
pub static RE_AVATAR: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[Behaviour\] Switching (.*?) to avatar (.*)").unwrap());
pub static RE_VIDEO: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video load for URL: (.*?), requested by (.*)").unwrap());
pub static RE_VIDEO_ALT: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video: (.*)").unwrap());
pub static RE_USR: Lazy<Regex> = Lazy::new(|| Regex::new(r"\((usr_[^)]+)\)").unwrap());

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

    let instance_owner = RE_USR.captures(access_raw).and_then(|c| c.get(1)).map(|m| m.as_str().to_string());

    (access_type, instance_owner)
}
