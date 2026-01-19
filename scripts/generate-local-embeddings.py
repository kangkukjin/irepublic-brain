#!/usr/bin/env python3
"""
로컬 임베딩 생성 스크립트
사용법:
  1. pip install sentence-transformers
  2. python scripts/generate-local-embeddings.py

출력:
  - public/data/embeddings.json
  - public/data/similarity-matrix.json
"""

import json
import sqlite3
import os
import numpy as np
from pathlib import Path

# sentence-transformers 설치 확인
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("sentence-transformers가 설치되어 있지 않습니다.")
    print("설치 명령: pip install sentence-transformers")
    exit(1)

# 경로 설정
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DB_PATH = Path.home() / 'Desktop/AI/indiebizOS/data/packages/installed/tools/blog/data/blog_insight.db'
OUTPUT_DIR = PROJECT_DIR / 'public/data'

def cosine_similarity(a, b):
    """코사인 유사도 계산"""
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def find_top_k_similar(embeddings, post_ids, target_idx, k=10):
    """Top-K 유사 글 찾기"""
    target_emb = embeddings[target_idx]
    scores = []

    for i, emb in enumerate(embeddings):
        if i == target_idx:
            continue
        score = cosine_similarity(target_emb, emb)
        scores.append((post_ids[i], float(score)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [{'id': s[0], 'score': round(s[1], 4)} for s in scores[:k]]

def main():
    # 출력 디렉토리 생성
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # DB 확인
    if not DB_PATH.exists():
        print(f"DB 파일을 찾을 수 없습니다: {DB_PATH}")
        exit(1)

    print("=" * 50)
    print("🧠 사유의 뇌 - 로컬 임베딩 생성")
    print("=" * 50)

    # 모델 로딩
    print("\n1. 모델 로딩 중... (처음엔 다운로드 필요, ~500MB)")
    model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    print("   ✅ 모델 로딩 완료!")

    # DB에서 글 로드
    print("\n2. DB에서 글 로드 중...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT post_id, title, content
        FROM posts
        WHERE content IS NOT NULL AND content != ''
        ORDER BY pub_date DESC
    """)
    posts = cursor.fetchall()
    conn.close()
    print(f"   ✅ {len(posts)}개 글 로드 완료!")

    # 텍스트 준비
    print("\n3. 임베딩 생성 중...")
    texts = [f"{p[1]}\n\n{(p[2] or '')[:500]}" for p in posts]
    post_ids = [p[0] for p in posts]

    # 배치 임베딩 생성
    embeddings = model.encode(
        texts,
        show_progress_bar=True,
        batch_size=64,
        convert_to_numpy=True
    )
    print(f"   ✅ 임베딩 생성 완료! Shape: {embeddings.shape}")

    # 임베딩 저장 (소수점 5자리로 압축)
    print("\n4. 임베딩 저장 중...")
    embeddings_data = []
    for i, post_id in enumerate(post_ids):
        embeddings_data.append({
            'id': post_id,
            'embedding': [round(float(v), 5) for v in embeddings[i]]
        })

    embeddings_path = OUTPUT_DIR / 'embeddings.json'
    with open(embeddings_path, 'w', encoding='utf-8') as f:
        json.dump(embeddings_data, f)

    file_size = embeddings_path.stat().st_size / (1024 * 1024)
    print(f"   ✅ embeddings.json 저장 완료! ({file_size:.1f}MB)")

    # 유사도 매트릭스 생성
    print("\n5. 유사도 매트릭스 생성 중...")
    similarity_matrix = []
    total = len(post_ids)

    for i, post_id in enumerate(post_ids):
        if i % 500 == 0:
            print(f"   진행: {i}/{total} ({100*i/total:.1f}%)")
        similar = find_top_k_similar(embeddings, post_ids, i, k=10)
        similarity_matrix.append({
            'id': post_id,
            'similar': similar
        })

    similarity_path = OUTPUT_DIR / 'similarity-matrix.json'
    with open(similarity_path, 'w', encoding='utf-8') as f:
        json.dump(similarity_matrix, f)
    print(f"   ✅ similarity-matrix.json 저장 완료!")

    # 완료
    print("\n" + "=" * 50)
    print("🎉 완료!")
    print(f"   - embeddings.json: {len(embeddings_data)}개 글")
    print(f"   - similarity-matrix.json: {len(similarity_matrix)}개 유사도")
    print("=" * 50)

if __name__ == '__main__':
    main()
