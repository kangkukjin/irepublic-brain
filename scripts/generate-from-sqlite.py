#!/usr/bin/env python3
"""
SQLite에서 정적 JSON 파일 생성 - Firebase 호출 없이
"""

import json
import sqlite3
from collections import defaultdict
import os

# SQLite 연결 (원본 DB 경로)
DB_PATH = '/Users/kangkukjin/Desktop/AI/blog/tistory_blog.db'

def generate_all():
    print("정적 데이터 생성 중 (SQLite에서)...")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 숨길 카테고리
    hidden_categories = ['임시보관함', '집자료들']

    # 모든 posts 가져오기 (숨길 카테고리 제외)
    cursor.execute('''
        SELECT post_id, title, category, publish_date, char_count
        FROM posts
        WHERE category NOT LIKE '임시보관함%'
          AND category NOT LIKE '집자료들%'
        ORDER BY publish_date DESC
    ''')
    rows = cursor.fetchall()
    print(f"총 {len(rows)}개 글 처리 중...")

    # 1. 경량 글 목록
    posts_light = []
    month_counts = defaultdict(int)
    hierarchy = defaultdict(lambda: defaultdict(int))

    for row in rows:
        # 카테고리 변환 (재검토 글들 -> 미분류)
        category = row['category'] or ''
        if category.startswith('재검토 글들'):
            category = category.replace('재검토 글들', '미분류')

        # 경량 목록
        posts_light.append({
            'post_id': str(row['post_id']),
            'title': row['title'],
            'category': category,
            'pub_date': row['publish_date'],
            'char_count': row['char_count'] or 0,
        })

        # 월별 통계
        pub_date = row['publish_date'] or ''
        if pub_date:
            year_month = pub_date[:7]
            month_counts[year_month] += 1

        # 카테고리 계층
        if category:
            if '/' in category:
                parts = category.split('/')
                main = parts[0]
                sub = parts[1]
            else:
                main = category
                sub = None
            hierarchy[main][sub] += 1

    conn.close()

    # 2. 월별 통계
    monthly_stats = [
        {'yearMonth': ym, 'count': count}
        for ym, count in sorted(month_counts.items())
    ]

    # 3. 카테고리 계층 (map API 형식)
    categories = []
    for main, subs in hierarchy.items():
        total = sum(subs.values())
        sub_list = [
            {'name': sub, 'count': count}
            for sub, count in sorted(subs.items(), key=lambda x: -x[1])
        ]
        categories.append({
            'main': main,
            'total': total,
            'subs': sub_list
        })
    categories.sort(key=lambda x: -x['total'])

    # public/data 폴더에 저장
    os.makedirs('../public/data', exist_ok=True)

    with open('../public/data/posts-light.json', 'w', encoding='utf-8') as f:
        json.dump({
            'posts': posts_light,
            'stats': {'totalPosts': len(posts_light), 'years': 17}
        }, f, ensure_ascii=False)
    print(f"✅ posts-light.json 저장 ({len(posts_light)}개)")

    with open('../public/data/monthly-stats.json', 'w', encoding='utf-8') as f:
        json.dump({'monthlyStats': monthly_stats}, f, ensure_ascii=False)
    print(f"✅ monthly-stats.json 저장 ({len(monthly_stats)}개월)")

    with open('../public/data/categories.json', 'w', encoding='utf-8') as f:
        json.dump({'categories': categories}, f, ensure_ascii=False)
    print(f"✅ categories.json 저장 ({len(categories)}개 카테고리)")

    print("\n🎉 모든 정적 데이터 생성 완료!")

if __name__ == '__main__':
    generate_all()
