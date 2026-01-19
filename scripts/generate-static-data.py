#!/usr/bin/env python3
"""
정적 JSON 파일 생성 - 빠른 로딩을 위해
"""

import json
import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict

# Firebase 초기화
cred = credentials.Certificate('firebase-admin-key.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def generate_all():
    print("정적 데이터 생성 중...")

    # 모든 posts 가져오기
    posts_ref = db.collection('posts')
    posts = list(posts_ref.order_by('pub_date', direction=firestore.Query.DESCENDING).stream())
    print(f"총 {len(posts)}개 글 처리 중...")

    # 1. 경량 글 목록 (content 제외)
    posts_light = []
    month_counts = defaultdict(int)
    hierarchy = defaultdict(lambda: defaultdict(int))

    for post in posts:
        data = post.to_dict()

        # 경량 목록
        posts_light.append({
            'post_id': data.get('post_id', ''),
            'title': data.get('title', ''),
            'category': data.get('category', ''),
            'pub_date': data.get('pub_date', ''),
            'char_count': data.get('char_count', 0),
        })

        # 월별 통계
        pub_date = data.get('pub_date', '')
        if pub_date:
            year_month = pub_date[:7]
            month_counts[year_month] += 1

        # 카테고리 계층
        category = data.get('category', '')
        if category:
            if '/' in category:
                parts = category.split('/')
                main = parts[0]
                sub = parts[1]
            else:
                main = category
                sub = None
            hierarchy[main][sub] += 1

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
    import os
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
