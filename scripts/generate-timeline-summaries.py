#!/usr/bin/env python3
"""
타임라인 요약 제목 생성 스크립트

각 분기/월별로 글 제목들을 분석하여 하나의 요약 제목을 생성합니다.
Claude API를 사용하여 요약을 생성합니다.

사용법:
1. ANTHROPIC_API_KEY 환경변수 설정
2. python scripts/generate-timeline-summaries.py 실행
3. public/data/timeline-summaries.json 생성됨
"""

import sqlite3
import json
import os
from datetime import datetime
from collections import defaultdict

# Anthropic API 사용 여부 (False면 첫 글 제목 사용)
USE_AI = True

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False
    print("⚠️ anthropic 패키지 없음. 첫 글 제목을 사용합니다.")
    print("   pip install anthropic 으로 설치하세요.")

# 경로 설정
DB_PATH = "/Users/kangkukjin/Desktop/AI/indiebizOS/data/packages/installed/tools/blog/data/blog_insight.db"
OUTPUT_PATH = "public/data/timeline-summaries.json"

def get_posts_by_period():
    """DB에서 월별로 글을 가져옵니다."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT post_id, title, strftime('%Y', pub_date) as year,
               strftime('%m', pub_date) as month, pub_date
        FROM posts
        WHERE pub_date IS NOT NULL
        ORDER BY pub_date ASC
    """)

    rows = cursor.fetchall()
    conn.close()

    # 월별로 그룹화
    monthly = defaultdict(list)
    for post_id, title, year, month, pub_date in rows:
        key = f"{year}-{month}"
        monthly[key].append({
            'id': post_id,
            'title': title,
            'date': pub_date
        })

    return monthly

def generate_summary_with_ai(titles: list[str], period: str) -> str:
    """Claude API로 제목 요약 생성"""
    if not HAS_ANTHROPIC or not USE_AI:
        return titles[0] if titles else period

    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        print(f"⚠️ ANTHROPIC_API_KEY 없음. {period}는 첫 글 제목 사용")
        return titles[0] if titles else period

    client = anthropic.Anthropic(api_key=api_key)

    prompt = f"""다음은 {period}에 작성된 블로그 글 제목들입니다:

{chr(10).join(f'- {t}' for t in titles[:20])}

이 글들의 공통 주제나 분위기를 담은 짧은 요약 제목을 한 문장(10~20자)으로 만들어주세요.
예시: "AI와 삶의 변화를 고민하다", "여행과 성찰의 시간", "글쓰기의 본질을 묻다"

요약 제목만 출력하세요:"""

    try:
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"⚠️ API 오류 ({period}): {e}")
        return titles[0] if titles else period

def generate_simple_summary(titles: list[str], period: str) -> str:
    """첫 글 제목을 요약으로 사용 (AI 없이)"""
    if not titles:
        return period
    # 가장 긴 제목을 선택 (더 서술적일 가능성)
    longest = max(titles[:5], key=len)
    # 30자 이상이면 자르기
    if len(longest) > 30:
        longest = longest[:27] + "..."
    return longest

def main():
    print("📚 타임라인 요약 생성 시작...")

    monthly = get_posts_by_period()
    print(f"   {len(monthly)}개 월 발견")

    summaries = {}

    # 연도별 요약
    yearly = defaultdict(list)
    for period, posts in monthly.items():
        year = period[:4]
        yearly[year].extend([p['title'] for p in posts])

    print("\n🗓️ 연도별 요약 생성 중...")
    for year, titles in sorted(yearly.items()):
        if USE_AI and HAS_ANTHROPIC and os.getenv('ANTHROPIC_API_KEY'):
            summary = generate_summary_with_ai(titles, f"{year}년")
        else:
            summary = generate_simple_summary(titles, f"{year}년")
        summaries[year] = {
            'summary': summary,
            'count': len(titles)
        }
        print(f"   {year}: {summary} ({len(titles)}개)")

    # 분기별 요약
    print("\n📅 분기별 요약 생성 중...")
    quarterly = defaultdict(list)
    for period, posts in monthly.items():
        year, month = period.split('-')
        quarter = (int(month) - 1) // 3 + 1
        key = f"{year}-Q{quarter}"
        quarterly[key].extend([p['title'] for p in posts])

    for quarter_key, titles in sorted(quarterly.items()):
        if len(titles) >= 5:  # 5개 이상인 분기만
            if USE_AI and HAS_ANTHROPIC and os.getenv('ANTHROPIC_API_KEY'):
                summary = generate_summary_with_ai(titles, quarter_key)
            else:
                summary = generate_simple_summary(titles, quarter_key)
            summaries[quarter_key] = {
                'summary': summary,
                'count': len(titles)
            }
            print(f"   {quarter_key}: {summary} ({len(titles)}개)")

    # 월별 요약 (글이 많은 월만)
    print("\n📆 월별 요약 생성 중...")
    for period, posts in sorted(monthly.items()):
        titles = [p['title'] for p in posts]
        if len(titles) >= 10:  # 10개 이상인 월만
            if USE_AI and HAS_ANTHROPIC and os.getenv('ANTHROPIC_API_KEY'):
                summary = generate_summary_with_ai(titles, period)
            else:
                summary = generate_simple_summary(titles, period)
            summaries[period] = {
                'summary': summary,
                'count': len(titles)
            }
            print(f"   {period}: {summary} ({len(titles)}개)")

    # 저장
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(summaries, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 완료! {OUTPUT_PATH} 저장됨")
    print(f"   총 {len(summaries)}개 요약 생성")

if __name__ == "__main__":
    main()
