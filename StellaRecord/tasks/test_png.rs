use std::fs;
use std::sync::LazyLock;
use regex::Regex;

static ID_RE: LazyLock<Regex> = LazyLock::new(|| match Regex::new(r"<vrc:WorldID>(.*?)</vrc:WorldID>") {
    Ok(re) => re,
    Err(err) => panic!("invalid world id regex: {err}"),
});
static NAME_RE: LazyLock<Regex> = LazyLock::new(|| match Regex::new(r"<vrc:WorldDisplayName>(.*?)</vrc:WorldDisplayName>") {
    Ok(re) => re,
    Err(err) => panic!("invalid world name regex: {err}"),
});

fn main() -> Result<(), String> {
    let path = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\Alpheratz-Photo-debug\VRChat_2026-02-09_21-58-44.701_2160x3840.png";
    let bytes = fs::read(path).map_err(|e| format!("failed to read png: {e}"))?;
    let content = String::from_utf8_lossy(&bytes);

    let world_id = ID_RE.captures(&content).map(|c| c[1].to_string());
    let world_name = NAME_RE.captures(&content).map(|c| c[1].to_string());

    // Some world names may have HTML entities like &amp; &lt; &gt; which we need to unescape.
    // For VRChat, usually it's plain utf8. But let's check.
    eprintln!("World ID: {:?}", world_id);
    eprintln!("World Name: {:?}", world_name);
    Ok(())
}
