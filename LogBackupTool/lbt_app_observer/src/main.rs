use lbt_core::logger::get_log_path;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::time::Duration;

fn main() {
    println!("LBTAppObserver - Monitoring appinfo.log...");

    let log_path = match get_log_path() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to locate log path: {}", e);
            return;
        }
    };

    if !log_path.exists() {
        println!("Log file does not exist. Waiting for OnsiteLogBackupTool to start...");
    }

    let mut last_pos = 0;
    
    loop {
        if log_path.exists() {
            if let Ok(mut file) = File::open(&log_path) {
                // Determine file size to handle truncations
                if let Ok(metadata) = file.metadata() {
                    let current_size = metadata.len();
                    if current_size < last_pos {
                        // File was truncated
                        println!("\n[File truncated - OnsiteLogBackupTool restarted]\n");
                        last_pos = 0;
                    }
                    
                    if let Ok(_) = file.seek(SeekFrom::Start(last_pos)) {
                        let mut buffer = String::new();
                        if let Ok(bytes_read) = file.read_to_string(&mut buffer) {
                            if bytes_read > 0 {
                                print!("{}", buffer);
                                last_pos += bytes_read as u64;
                            }
                        }
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_secs(5));
    }
}
