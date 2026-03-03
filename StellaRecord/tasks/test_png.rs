use std::fs;

fn main() {
    let path = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\Alpheratz-Photo-debug\VRChat_2026-02-09_21-58-44.701_2160x3840.png";
    let bytes = fs::read(path).unwrap();
    let content = String::from_utf8_lossy(&bytes);

    let id_re = regex::Regex::new(r"<vrc:WorldID>(.*?)</vrc:WorldID>").unwrap();
    let name_re = regex::Regex::new(r"<vrc:WorldDisplayName>(.*?)</vrc:WorldDisplayName>").unwrap();

    let world_id = id_re.captures(&content).map(|c| c[1].to_string());
    let world_name = name_re.captures(&content).map(|c| c[1].to_string());

    // Some world names may have HTML entities like &amp; &lt; &gt; which we need to unescape.
    // For VRChat, usually it's plain utf8. But let's check.
    println!("World ID: {:?}", world_id);
    println!("World Name: {:?}", world_name);
}
