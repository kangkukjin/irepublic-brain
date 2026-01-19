#!/usr/bin/env python3
"""
SQLite -> Firestore 마이그레이션 스크립트

사용법:
1. pip install firebase-admin
2. firebase-admin-key.json 파일을 이 스크립트와 같은 폴더에 둠
3. python migrate-to-firebase.py
"""
import sqlite3
import os
import firebase_admin
from firebase_admin import credentials, firestore

# 스크립트 위치 기준으로 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Firebase Admin 초기화
cred = credentials.Certificate(os.path.join(SCRIPT_DIR, 'firebase-admin-key.json'))
firebase_admin.initialize_app(cred)

db = firestore.client()

# SQLite DB 경로 (사용자 환경에 맞게 수정)
DB_PATH = '/Users/kangkukjin/Desktop/AI/indiebizOS/data/packages/installed/tools/blog/data/blog_insight.db'

# 숨길 카테고리
HIDDEN_CATEGORIES = ['임시보관함', '집자료들']
CATEGORY_REMAP = {'재검토 글들': '미분류'}

def should_hide(category):
    if not category:
        return False
    return any(category.startswith(hidden) for hidden in HIDDEN_CATEGORIES)

def remap_category(category):
    if not category:
        return category
    main_cat = category.split('/')[0] if '/' in category else category
    if main_cat in CATEGORY_REMAP:
        return category.replace(main_cat, CATEGORY_REMAP[main_cat])
    return category

def migrate():
    print('마이그레이션 시작...\n')

    # SQLite 연결
    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    cursor = sqlite_conn.cursor()

    # 1. Posts 마이그레이션
    print('1. Posts 테이블 마이그레이션...')
    cursor.execute('''
        SELECT id, post_id, title, category, pub_date, content, char_count
        FROM posts
    ''')
    posts = cursor.fetchall()

    post_count = 0
    skipped_count = 0
    batch = db.batch()
    batch_count = 0

    posts_dict = {}  # 나중에 summaries 필터링용

    for post in posts:
        post_dict = dict(post)
        posts_dict[post_dict['post_id']] = post_dict

        # 숨김 카테고리 필터링
        if should_hide(post_dict['category']):
            skipped_count += 1
            continue

        doc_ref = db.collection('posts').document(post_dict['post_id'])
        batch.set(doc_ref, {
            'id': post_dict['id'],
            'post_id': post_dict['post_id'],
            'title': post_dict['title'],
            'category': remap_category(post_dict['category']),
            'pub_date': post_dict['pub_date'],
            'content': post_dict['content'],
            'char_count': post_dict['char_count']
        })

        post_count += 1
        batch_count += 1

        # Firestore batch는 500개 제한
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
            print(f'  - {post_count}개 처리중...')

    # 남은 배치 커밋
    if batch_count > 0:
        batch.commit()

    print(f'  - 총 {post_count}개 글 완료 ({skipped_count}개 스킵)')

    # 2. Summaries 마이그레이션
    print('\n2. Summaries 테이블 마이그레이션...')
    cursor.execute('''
        SELECT post_id, summary, keywords FROM summaries
    ''')
    summaries = cursor.fetchall()

    summary_count = 0
    batch = db.batch()
    batch_count = 0

    for summary in summaries:
        summary_dict = dict(summary)

        # 해당 포스트가 숨김 카테고리인지 확인
        post = posts_dict.get(summary_dict['post_id'])
        if post and should_hide(post['category']):
            continue

        doc_ref = db.collection('summaries').document(summary_dict['post_id'])
        batch.set(doc_ref, {
            'post_id': summary_dict['post_id'],
            'summary': summary_dict['summary'],
            'keywords': summary_dict['keywords']
        })

        summary_count += 1
        batch_count += 1

        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0
            print(f'  - {summary_count}개 처리중...')

    # 남은 배치 커밋
    if batch_count > 0:
        batch.commit()

    print(f'  - 총 {summary_count}개 요약 완료')

    print('\n✅ 마이그레이션 완료!')
    print(f'- Posts: {post_count}개')
    print(f'- Summaries: {summary_count}개')

    sqlite_conn.close()

if __name__ == '__main__':
    migrate()
