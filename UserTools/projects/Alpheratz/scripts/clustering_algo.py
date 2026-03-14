import sqlite3
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity
import json
import os

def setup_db(db_path=":memory:"):
    """Initialize DB Schema for photo embeddings."""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS photo_embeddings (
            photo_id       TEXT PRIMARY KEY,
            world_emb      BLOB,
            avatar_emb     BLOB,
            world_cluster  INTEGER,
            avatar_cluster INTEGER
        )
    """)
    conn.commit()
    return conn

def insert_embedding(conn, photo_id, world_emb, avatar_emb):
    """Insert or update embedding vectors for a photo."""
    cursor = conn.cursor()
    # Save as float64 byte buffer
    cursor.execute(
        "INSERT OR REPLACE INTO photo_embeddings (photo_id, world_emb, avatar_emb) VALUES (?, ?, ?)",
        (photo_id, world_emb.astype(np.float64).tobytes(), avatar_emb.astype(np.float64).tobytes())
    )
    conn.commit()

def load_embeddings(conn):
    """Load photo embeddings from DB."""
    cursor = conn.cursor()
    cursor.execute("SELECT photo_id, world_emb, avatar_emb FROM photo_embeddings")
    rows = cursor.fetchall()
    
    photo_ids = []
    world_embs = []
    avatar_embs = []
    
    for row in rows:
        photo_ids.append(row[0])
        # DB data loaded back as float64 array
        world_embs.append(np.frombuffer(row[1], dtype=np.float64))
        avatar_embs.append(np.frombuffer(row[2], dtype=np.float64))
        
    return photo_ids, np.array(world_embs), np.array(avatar_embs)

def cluster_embeddings(conn):
    """Run DBSCAN separately on world embeddings and avatar embeddings, then update user clusters."""
    photo_ids, world_embs, avatar_embs = load_embeddings(conn)
    if len(photo_ids) == 0:
        return
        
    # ワールドクラスタ (eps=0.15)
    world_clustering = DBSCAN(eps=0.15, min_samples=2, metric="cosine").fit(world_embs)
    world_labels = world_clustering.labels_
    
    # 衣装クラスタ (eps=0.20)
    avatar_clustering = DBSCAN(eps=0.20, min_samples=2, metric="cosine").fit(avatar_embs)
    avatar_labels = avatar_clustering.labels_
    
    # DBを更新
    cursor = conn.cursor()
    for pid, w_lbl, a_lbl in zip(photo_ids, world_labels, avatar_labels):
        cursor.execute(
            "UPDATE photo_embeddings SET world_cluster = ?, avatar_cluster = ? WHERE photo_id = ?",
            (int(w_lbl), int(a_lbl), pid)
        )
    conn.commit()
    
    print(f"Clustering complete. Processed {len(photo_ids)} photos.")
    return list(zip(photo_ids, world_labels, avatar_labels))

def search_similar_world(conn, query_world_emb, top_k=5):
    """Search by identical world (cosine similarity distance)."""
    photo_ids, world_embs, _ = load_embeddings(conn)
    if len(photo_ids) == 0:
        return []
        
    similarities = cosine_similarity([query_world_emb], world_embs)[0]
    
    results = []
    for i, sim in enumerate(similarities):
        results.append((photo_ids[i], float(sim)))
        
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]

def search_similar_avatar(conn, query_avatar_emb, top_k=5):
    """Search by identical avatar (cosine similarity distance)."""
    photo_ids, _, avatar_embs = load_embeddings(conn)
    if len(photo_ids) == 0:
        return []
        
    similarities = cosine_similarity([query_avatar_emb], avatar_embs)[0]
    
    results = []
    for i, sim in enumerate(similarities):
        results.append((photo_ids[i], float(sim)))
        
    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_k]

if __name__ == "__main__":
    print("--- Alpheratz Identical World/Avatar Matching Prototyping Module ---")
    conn = setup_db()
    
    print("Generating dummy data (Simulating CLIP embeddings)...")
    for i in range(20):
        # Create some identical data groups for DBSCAN to cluster
        if i < 5:
            base_w = np.ones(512)
            base_a = np.ones(512)
        elif i < 10:
            base_w = np.zeros(512)
            base_w[0] = 1
            base_a = np.zeros(512)
            base_a[1] = 1
        else:
            base_w = np.random.rand(512)
            base_a = np.random.rand(512)
            
        # Add slight noise, then normalize
        w_emb = base_w + np.random.rand(512) * 0.05
        a_emb = base_a + np.random.rand(512) * 0.05
        w_emb = w_emb / np.linalg.norm(w_emb)
        a_emb = a_emb / np.linalg.norm(a_emb)
        
        insert_embedding(conn, f"photo_{i}.png", w_emb, a_emb)
        
    print("Clustering data...")
    clusters = cluster_embeddings(conn)
    for pid, w, a in clusters:
        print(f"  {pid}: world_cluster={w}, avatar_cluster={a}")
        
    print("\nSimulating Search for World (Query = photo_0.png's world):")
    photo_ids, world_embs, _ = load_embeddings(conn)
    res = search_similar_world(conn, world_embs[0])
    for pid, sim in res:
        print(f"  {pid}: similarity={sim:.4f}")
        
    print("\nSimulating Search for Avatar (Query = photo_5.png's avatar):")
    _, _, avatar_embs = load_embeddings(conn)
    res = search_similar_avatar(conn, avatar_embs[5])
    for pid, sim in res:
        print(f"  {pid}: similarity={sim:.4f}")
