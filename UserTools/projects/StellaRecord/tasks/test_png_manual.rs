use std::fs;
use std::path::Path;
use std::io::Read;

fn extract_vrc_meta_from_png(path: &Path) -> (Option<String>, Option<String>) {
    if let Ok(mut file) = fs::File::open(path) {
        let mut buf = vec![0; 256 * 1024];
        let n = match file.read(&mut buf) {
            Ok(n) => n,
            Err(_) => return (None, None),
        };
        let content = String::from_utf8_lossy(&buf[..n]);
        
        let mut world_id = None;
        let mut world_name = None;
        
        if let Some(id_start) = content.find("<vrc:WorldID>") {
            if let Some(id_end) = content[id_start..].find("</vrc:WorldID>") {
                world_id = Some(content[id_start + 13..id_start + id_end].to_string());
            }
        }
        
        if let Some(name_start) = content.find("<vrc:WorldDisplayName>") {
            if let Some(name_end) = content[name_start..].find("</vrc:WorldDisplayName>") {
                world_name = Some(content[name_start + 22..name_start + name_end].to_string());
            }
        }
        
        let decode_xml = |s: String| -> String {
            s.replace("&amp;", "&")
             .replace("&lt;", "<")
             .replace("&gt;", ">")
             .replace("&quot;", "\"")
             .replace("&apos;", "'")
        };
        
        return (world_name.map(decode_xml), world_id);
    }
    (None, None)
}

fn main() {
    let path = Path::new(r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\Alpheratz-Photo-debug\VRChat_2026-02-09_21-58-44.701_2160x3840.png");
    println!("{:?}", extract_vrc_meta_from_png(path));

    let path2 = Path::new(r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\Alpheratz-Photo-debug\VRChat_2026-02-11_19-32-04.665_2160x3840.png");
    println!("{:?}", extract_vrc_meta_from_png(path2));
}
