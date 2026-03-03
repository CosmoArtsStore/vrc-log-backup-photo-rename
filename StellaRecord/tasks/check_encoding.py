import os

log_dir = r"f:\DEVELOPFOLDER\RE-NAME-SYS\public\log-check\raw-log"
files = [f for f in os.listdir(log_dir) if f.endswith(".txt")]

for f in files[:5]:
    path = os.path.join(log_dir, f)
    with open(path, "rb") as f0:
        head = f0.read(4)
        print(f"{path}: {head.hex()}")
