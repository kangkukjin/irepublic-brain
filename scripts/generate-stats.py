#!/usr/bin/env python3
"""
Firebase에 통계 데이터 생성/저장
한 번 실행하면 월별 통계와 카테고리 계층 구조가 저장됨
"""

import json
import firebase_admin
from firebase_admin import credentials, firestore
from collections import defaultdict

# Firebase 초기화
cred = credentials.Certificate('firebase-admin-key.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

def generate_stats():
    print("통계 데이터 생성 중...")

    # 모든 posts 가져오기
    posts_ref = db.collection('posts')
    posts = list(posts_ref.stream())
    print(f"총 {len(posts)}개 글 분석 중...")

    # 월별 통계
    month_counts = defaultdict(int)
    # 카테고리 계층
    hierarchy = defaultdict(lambda: defaultdict(int))

    for post in posts:
        data = post.to_dict()

        # 월별 통계
        pub_date = data.get('pub_date', '')
        if pub_date:
            year_month = pub_date[:7]  # "YYYY-MM"
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
                sub = '__null__'
            hierarchy[main][sub] += 1

    # 월별 통계 저장
    monthly_stats = [
        {'yearMonth': ym, 'count': count}
        for ym, count in sorted(month_counts.items())
    ]

    db.collection('stats').document('monthly').set({
        'monthlyStats': monthly_stats,
        'updatedAt': firestore.SERVER_TIMESTAMP
    })
    print(f"월별 통계 저장 완료: {len(monthly_stats)}개 월")

    # 카테고리 계층 저장
    category_hierarchy = []
    for main, subs in hierarchy.items():
        for sub, count in subs.items():
            category_hierarchy.append({
                'main': main,
                'sub': None if sub == '__null__' else sub,
                'count': count
            })

    # count 기준 정렬
    category_hierarchy.sort(key=lambda x: x['count'], reverse=True)

    db.collection('stats').document('categories').set({
        'hierarchy': category_hierarchy,
        'updatedAt': firestore.SERVER_TIMESTAMP
    })
    print(f"카테고리 통계 저장 완료: {len(category_hierarchy)}개 카테고리")

    print("\n✅ 통계 생성 완료!")

if __name__ == '__main__':
    generate_stats()
