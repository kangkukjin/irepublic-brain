'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

// 클라이언트 캐시 (페이지 이동 후 돌아와도 다시 로드 안함)
const cache: {
  posts: Post[] | null;
  monthlyStats: MonthStat[] | null;
  categories: CategoryMap[] | null;
} = {
  posts: null,
  monthlyStats: null,
  categories: null,
};

// 타입 정의
interface Post {
  id: number;
  post_id: string;
  title: string;
  category: string;
  pub_date: string;
  char_count: number;
}

interface MonthStat {
  yearMonth: string;
  count: number;
}

interface CategoryMap {
  main: string;
  total: number;
  subs: { name: string | null; count: number }[];
}

interface Stats {
  totalPosts: number;
  years: number;
}

interface TimelineSummary {
  summary: string;
  count: number;
}

type TimelineSummaries = Record<string, TimelineSummary>;

// 2D 지도용 타입
interface CategoryMapPoint {
  name: string;
  x: number;
  y: number;
  count: number;
}

interface PostMapPoint {
  id: string;
  title: string;
  category: string;
  pub_date: string;
  x: number;
  y: number;
}

type MapZoomLevel = 'categories' | 'subcategories' | 'posts';

type ViewMode = 'gallery' | 'timeline' | 'map';

export default function BrainExplorer() {
  // 상태
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [stats, setStats] = useState<Stats>({ totalPosts: 0, years: 17 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthStat[]>([]);
  const [categories, setCategories] = useState<CategoryMap[]>([]);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [timelineZoom, setTimelineZoom] = useState<'year' | 'month' | 'day'>('year');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineSummaries, setTimelineSummaries] = useState<TimelineSummaries>({});

  // 2D 지도 상태
  const [categoryMapData, setCategoryMapData] = useState<CategoryMapPoint[]>([]);
  const [postsMapData, setPostsMapData] = useState<Record<string, PostMapPoint[]>>({});
  const [mapZoom, setMapZoom] = useState<MapZoomLevel>('categories');
  const [selectedMapCategory, setSelectedMapCategory] = useState<string | null>(null);
  const [hoveredPost, setHoveredPost] = useState<PostMapPoint | null>(null);

  // 갤러리 페이지네이션
  const [galleryPage, setGalleryPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const postsPerPage = 12;

  // 초기 데이터 로드 (통계는 갤러리 로드 시 가져옴)
  useEffect(() => {
    // 타임라인 요약 데이터 로드
    fetch('/data/timeline-summaries.json')
      .then(r => r.json())
      .then(data => setTimelineSummaries(data))
      .catch(() => console.log('타임라인 요약 데이터 없음'));

    // 2D 지도 데이터 로드
    fetch('/data/category-map.json')
      .then(r => r.json())
      .then(data => setCategoryMapData(data))
      .catch(() => console.log('카테고리 지도 데이터 없음'));

    fetch('/data/posts-map.json')
      .then(r => r.json())
      .then(data => setPostsMapData(data))
      .catch(() => console.log('글 지도 데이터 없음'));
  }, []);

  // 뷰 모드 변경 시 데이터 로드 (정적 JSON + 캐시 활용)
  useEffect(() => {
    switch (viewMode) {
      case 'gallery':
        // 캐시에 있으면 바로 사용
        if (cache.posts) {
          setPosts(cache.posts);
          setStats({ totalPosts: cache.posts.length, years: 17 });
          setLoading(false);
          return;
        }
        setLoading(true);
        // 정적 JSON 파일 사용 (Firebase 호출 없음, 매우 빠름)
        fetch('/data/posts-light.json')
          .then(r => r.json())
          .then(data => {
            const loadedPosts = data.posts || [];
            cache.posts = loadedPosts;
            setPosts(loadedPosts);
            setStats(data.stats || { totalPosts: 0, years: 17 });
            setGalleryPage(1);
            setHasMore(false);
            setLoading(false);
          });
        break;

      case 'timeline':
        if (cache.monthlyStats) {
          setMonthlyStats(cache.monthlyStats);
          setLoading(false);
          return;
        }
        setLoading(true);
        // 정적 JSON 파일 사용
        fetch('/data/monthly-stats.json')
          .then(r => r.json())
          .then(data => {
            const loadedStats = data.monthlyStats || [];
            cache.monthlyStats = loadedStats;
            setMonthlyStats(loadedStats);
            setLoading(false);
          });
        break;

      case 'map':
        if (cache.categories) {
          setCategories(cache.categories);
          setLoading(false);
          return;
        }
        setLoading(true);
        // 정적 JSON 파일 사용
        fetch('/data/categories.json')
          .then(r => r.json())
          .then(data => {
            const loadedCategories = data.categories || [];
            cache.categories = loadedCategories;
            setCategories(loadedCategories);
            setLoading(false);
          });
        break;
    }
  }, [viewMode]);

  // 서브카테고리 또는 메인 카테고리 선택 시 해당 글 로드 (캐시된 데이터에서 필터링)
  useEffect(() => {
    if (mapZoom === 'posts' && selectedMapCategory) {
      // 캐시에서 가져오거나, 없으면 로드
      const filterPosts = (allPosts: Post[]) => {
        if (selectedSubCategory) {
          // 서브카테고리 선택됨: "메인/서브" 형태로 필터
          const fullCategory = `${selectedMapCategory}/${selectedSubCategory}`;
          return allPosts.filter(p => p.category === fullCategory);
        } else {
          // 서브카테고리 없음: 메인 카테고리로 시작하는 모든 글
          return allPosts.filter(p =>
            p.category === selectedMapCategory ||
            p.category.startsWith(`${selectedMapCategory}/`)
          );
        }
      };

      if (cache.posts) {
        setPosts(filterPosts(cache.posts));
      } else {
        setLoading(true);
        fetch('/data/posts-light.json')
          .then(r => r.json())
          .then(data => {
            const allPosts = data.posts || [];
            cache.posts = allPosts;
            setPosts(filterPosts(allPosts));
            setLoading(false);
          });
      }
    }
  }, [selectedSubCategory, selectedMapCategory, mapZoom]);

  // 타임라인 줌 처리
  useEffect(() => {
    if (selectedMonth && timelineZoom === 'day') {
      setLoading(true);
      const [year, month] = selectedMonth.split('-');
      const start = `${year}-${month}-01`;
      const nextMonth = parseInt(month) === 12 ? '01' : String(parseInt(month) + 1).padStart(2, '0');
      const nextYear = parseInt(month) === 12 ? String(parseInt(year) + 1) : year;
      const end = `${nextYear}-${nextMonth}-01`;

      fetch(`/api/timeline?start=${start}&end=${end}`)
        .then(r => r.json())
        .then(data => {
          setPosts(data.posts || []);
          setLoading(false);
        });
    }
  }, [selectedMonth, timelineZoom]);

  // 연도별 그룹화 (타임라인용)
  const yearlyData = useMemo(() => {
    const grouped: Record<string, { months: Record<string, number>; total: number }> = {};

    monthlyStats.forEach(stat => {
      const [year, month] = stat.yearMonth.split('-');
      if (!grouped[year]) {
        grouped[year] = { months: {}, total: 0 };
      }
      grouped[year].months[month] = stat.count;
      grouped[year].total += stat.count;
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([year, data]) => ({ year, ...data }));
  }, [monthlyStats]);

  // 검색
  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    const res = await fetch(`/api/posts?q=${encodeURIComponent(searchQuery)}&limit=60`);
    const data = await res.json();
    setPosts(data.posts || []);
    setLoading(false);
    setViewMode('gallery');
  }, [searchQuery]);

  // 뷰 모드 정보 (미니멀)
  const viewModes = [
    { id: 'gallery', label: '글' },
    { id: 'timeline', label: '시간' },
    { id: 'map', label: '주제' },
  ];

  // 갤러리 페이지네이션 계산
  const totalPages = Math.ceil(posts.length / postsPerPage);
  const paginatedPosts = posts.slice(
    (galleryPage - 1) * postsPerPage,
    galleryPage * postsPerPage
  );

  // 서브카테고리 글들의 2D 좌표 (안정적인 해시 기반)
  const subCategoryPostsWithCoords = useMemo(() => {
    if (!selectedSubCategory || mapZoom !== 'posts') return [];

    return posts.map((p, i) => {
      // post_id 기반으로 안정적인 좌표 생성
      const hash = p.post_id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const x = 10 + ((hash * 17) % 80);
      const y = 10 + ((hash * 31 + i * 7) % 80);
      return {
        id: p.post_id,
        title: p.title,
        category: p.category,
        pub_date: p.pub_date,
        x,
        y,
      };
    });
  }, [posts, selectedSubCategory, mapZoom]);

  return (
    <div className="min-h-screen bg-white">
      {/* 미니멀 헤더 */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex items-center justify-between h-16">
            {/* 로고 */}
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              나를 지키는 공간
            </h1>

            {/* 네비게이션 */}
            <nav className="flex items-center gap-1">
              {viewModes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => {
                    setViewMode(mode.id as ViewMode);
                    setSelectedYear(null);
                    setSelectedMonth(null);
                    setTimelineZoom('year');
                    setMapZoom('categories');
                    setSelectedMapCategory(null);
                    setSelectedSubCategory(null);
                  }}
                  className={`px-4 py-2 text-sm transition-colors ${
                    viewMode === mode.id
                      ? 'text-neutral-900 font-medium'
                      : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </nav>

            {/* 검색 */}
            <form onSubmit={handleSearch} className="hidden md:block">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="검색"
                className="w-48 px-4 py-2 text-sm bg-neutral-50 border-0 rounded-full focus:outline-none focus:ring-1 focus:ring-neutral-300 placeholder:text-neutral-400"
              />
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        {/* 로딩 */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="w-6 h-6 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
            <p className="text-neutral-400 text-sm animate-pulse">
              {viewMode === 'gallery' && '17년간의 기억을 불러오는 중...'}
              {viewMode === 'timeline' && '시간의 흐름을 정리하는 중...'}
              {viewMode === 'map' && '생각의 지도를 그리는 중...'}
            </p>
          </div>
        )}

        {/* ========== 갤러리 뷰 (카드 그리드) ========== */}
        {viewMode === 'gallery' && !loading && (
          <div>
            {/* 카드 그리드 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedPosts.map(post => (
                <Link
                  key={post.post_id}
                  href={`/post/${post.post_id}`}
                  className="block p-5 bg-neutral-50 rounded-2xl hover:bg-neutral-100 transition-colors"
                >
                  <h3 className="text-[15px] font-semibold text-neutral-700 leading-relaxed line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="mt-3 text-sm text-neutral-400">
                    {post.pub_date?.slice(0, 10)}
                  </p>
                </Link>
              ))}
            </div>

            {/* 페이지네이션 슬라이더 */}
            {totalPages > 1 && (
              <div className="mt-12 flex flex-col items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={totalPages}
                  value={galleryPage}
                  onChange={(e) => setGalleryPage(Number(e.target.value))}
                  className="w-full max-w-md h-1 bg-neutral-200 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-neutral-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer hover:[&::-webkit-slider-thumb]:bg-neutral-800"
                />
                <div className="flex items-center gap-4 text-sm text-neutral-400">
                  <button
                    onClick={() => setGalleryPage(1)}
                    className="hover:text-neutral-700 transition-colors"
                  >
                    처음
                  </button>
                  <span className="text-neutral-300">
                    {galleryPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setGalleryPage(totalPages)}
                    className="hover:text-neutral-700 transition-colors"
                  >
                    끝
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ========== 타임라인 뷰 (미니멀) ========== */}
        {viewMode === 'timeline' && !loading && (
          <div>
            {/* 브레드크럼 */}
            {(selectedYear || selectedMonth) && (
              <div className="mb-8 flex items-center gap-2 text-sm text-neutral-400">
                <button
                  onClick={() => {
                    setTimelineZoom('year');
                    setSelectedYear(null);
                    setSelectedMonth(null);
                  }}
                  className="hover:text-neutral-600 transition-colors"
                >
                  전체
                </button>
                {selectedYear && (
                  <>
                    <span>/</span>
                    <button
                      onClick={() => {
                        setTimelineZoom('month');
                        setSelectedMonth(null);
                      }}
                      className={selectedMonth ? 'hover:text-neutral-600 transition-colors' : 'text-neutral-800'}
                    >
                      {selectedYear}
                    </button>
                  </>
                )}
                {selectedMonth && (
                  <>
                    <span>/</span>
                    <span className="text-neutral-800">{selectedMonth.split('-')[1]}월</span>
                  </>
                )}
              </div>
            )}

            {/* 연도별 뷰 */}
            {timelineZoom === 'year' && (
              <div className="space-y-1">
                {yearlyData.map(({ year, total }) => {
                  const summary = timelineSummaries[year];
                  return (
                    <button
                      key={year}
                      onClick={() => {
                        setSelectedYear(year);
                        setTimelineZoom('month');
                      }}
                      className="w-full flex items-baseline gap-6 py-4 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors text-left group"
                    >
                      <span className="text-2xl font-light text-neutral-300 w-16 tabular-nums">{year}</span>
                      <span className="flex-1 text-neutral-600 group-hover:text-neutral-800 transition-colors truncate">
                        {summary?.summary || ''}
                      </span>
                      <span className="text-sm text-neutral-300 tabular-nums">{total}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 월별 뷰 */}
            {timelineZoom === 'month' && selectedYear && (
              <div>
                {/* 분기별 요약 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
                  {[1, 2, 3, 4].map(q => {
                    const quarterKey = `${selectedYear}-Q${q}`;
                    const quarterSummary = timelineSummaries[quarterKey];
                    if (!quarterSummary) return <div key={q} />;
                    return (
                      <div key={q}>
                        <div className="text-xs text-neutral-400 mb-2">Q{q}</div>
                        <div className="text-sm text-neutral-600 leading-relaxed">
                          {quarterSummary.summary}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 월별 그리드 */}
                <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, '0');
                    const yearMonth = `${selectedYear}-${month}`;
                    const yearData = yearlyData.find(y => y.year === selectedYear);
                    const count = yearData?.months[month] || 0;

                    return (
                      <button
                        key={month}
                        onClick={() => {
                          if (count > 0) {
                            setSelectedMonth(yearMonth);
                            setTimelineZoom('day');
                          }
                        }}
                        disabled={count === 0}
                        className={`text-center py-4 transition-colors ${
                          count > 0
                            ? 'hover:bg-neutral-50 cursor-pointer'
                            : 'opacity-30 cursor-not-allowed'
                        }`}
                      >
                        <div className="text-lg text-neutral-400">{i + 1}</div>
                        <div className="text-xs text-neutral-300 mt-1">{count || '-'}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 일별 뷰 (글 목록) */}
            {timelineZoom === 'day' && (
              <div className="space-y-0 divide-y divide-neutral-100">
                {posts.map(post => (
                  <Link
                    key={post.post_id}
                    href={`/post/${post.post_id}`}
                    className="group block py-5 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors"
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="text-sm text-neutral-300 tabular-nums w-8">
                        {post.pub_date?.slice(8, 10)}
                      </span>
                      <span className="flex-1 text-neutral-700 group-hover:text-neutral-900">
                        {post.title}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========== 주제/지도 뷰 (3단계 드릴다운) ========== */}
        {viewMode === 'map' && !loading && (
          <div>
            {/* 브레드크럼 */}
            {(selectedMapCategory || selectedSubCategory) && (
              <div className="mb-8 flex items-center gap-2 text-sm text-neutral-400">
                <button
                  onClick={() => {
                    setMapZoom('categories');
                    setSelectedMapCategory(null);
                    setSelectedSubCategory(null);
                    setHoveredPost(null);
                  }}
                  className="hover:text-neutral-600 transition-colors"
                >
                  전체
                </button>
                {selectedMapCategory && (
                  <>
                    <span>/</span>
                    <button
                      onClick={() => {
                        setMapZoom('subcategories');
                        setSelectedSubCategory(null);
                        setHoveredPost(null);
                      }}
                      className={selectedSubCategory ? 'hover:text-neutral-600 transition-colors' : 'text-neutral-800'}
                    >
                      {selectedMapCategory}
                    </button>
                  </>
                )}
                {selectedSubCategory && (
                  <>
                    <span>/</span>
                    <span className="text-neutral-800">{selectedSubCategory}</span>
                  </>
                )}
              </div>
            )}

            {/* Level 1: 메인 카테고리 2D 지도 */}
            {mapZoom === 'categories' && (
              <div className="relative bg-neutral-50 rounded-2xl overflow-hidden" style={{ height: '70vh', minHeight: '500px' }}>
                {categoryMapData.map((cat) => {
                  const size = Math.max(12, Math.min(24, 10 + Math.sqrt(cat.count) * 0.8));
                  const categoryData = categories.find(c => c.main === cat.name);
                  const hasSubcategories = categoryData?.subs && categoryData.subs.some(s => s.name !== null);

                  return (
                    <button
                      key={cat.name}
                      onClick={() => {
                        setSelectedMapCategory(cat.name);
                        if (hasSubcategories) {
                          setMapZoom('subcategories');
                        } else {
                          setMapZoom('posts');
                        }
                      }}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-all duration-200 cursor-pointer group"
                      style={{
                        left: `${Math.max(10, Math.min(90, cat.x))}%`,
                        top: `${Math.max(10, Math.min(90, cat.y))}%`,
                      }}
                    >
                      <span
                        className="text-neutral-400 group-hover:text-neutral-700 transition-colors whitespace-nowrap"
                        style={{ fontSize: `${size}px` }}
                      >
                        {cat.name}
                      </span>
                      <span className="ml-1 text-neutral-300 group-hover:text-neutral-500 text-xs">
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Level 2: 서브카테고리 리스트 (Keywords 스타일) */}
            {mapZoom === 'subcategories' && selectedMapCategory && (
              <div>
                {(() => {
                  const categoryData = categories.find(c => c.main === selectedMapCategory);
                  const subs = categoryData?.subs || [];
                  const validSubs = subs.filter(s => s.name !== null);

                  if (validSubs.length === 0) {
                    return (
                      <div className="text-center py-12 text-neutral-400">
                        서브카테고리가 없습니다
                      </div>
                    );
                  }

                  return (
                    <div className="columns-2 md:columns-3 lg:columns-4 gap-8">
                      {validSubs.map((sub) => (
                        <button
                          key={sub.name}
                          onClick={() => {
                            setSelectedSubCategory(sub.name!);
                            setMapZoom('posts');
                          }}
                          className="block w-full text-left py-2 hover:bg-neutral-50 -mx-2 px-2 rounded transition-colors break-inside-avoid"
                        >
                          <span className="text-neutral-600 hover:text-neutral-900">{sub.name}</span>
                          <span className="ml-2 text-neutral-300 text-sm">{sub.count}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Level 3: 글 2D 지도 */}
            {mapZoom === 'posts' && selectedMapCategory && (
              <div className="relative bg-neutral-50 rounded-2xl overflow-hidden" style={{ height: '70vh', minHeight: '500px' }}>
                {/* 글 점들 */}
                {(selectedSubCategory
                  ? subCategoryPostsWithCoords
                  : postsMapData[selectedMapCategory] || []
                ).map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="absolute w-2 h-2 rounded-full bg-neutral-300 hover:bg-neutral-600 hover:scale-[4] transition-all duration-200 cursor-pointer"
                    style={{
                      left: `${post.x}%`,
                      top: `${post.y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    onMouseEnter={() => setHoveredPost(post)}
                    onMouseLeave={() => setHoveredPost(null)}
                  />
                ))}

                {/* 호버된 글 정보 */}
                {hoveredPost && (
                  <div
                    className="absolute z-20 bg-white rounded-lg shadow-lg p-4 max-w-sm pointer-events-none border border-neutral-100"
                    style={{
                      left: `${Math.min(70, Math.max(30, hoveredPost.x))}%`,
                      top: `${Math.min(65, Math.max(35, hoveredPost.y))}%`,
                      transform: 'translate(-50%, -120%)',
                    }}
                  >
                    <div className="text-sm text-neutral-700 leading-relaxed">
                      {hoveredPost.title}
                    </div>
                    <div className="mt-2 text-xs text-neutral-400">
                      {hoveredPost.pub_date?.slice(0, 10)}
                    </div>
                  </div>
                )}

                {/* 카테고리 정보 */}
                <div className="absolute bottom-4 left-4 text-xs text-neutral-400">
                  {selectedSubCategory
                    ? `${posts.length}개의 글`
                    : `${postsMapData[selectedMapCategory]?.length || 0}개의 글`
                  }
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 미니멀 푸터 */}
      <footer className="mt-24 py-8 text-center text-xs text-neutral-300">
        <p>2007 — 2026</p>
      </footer>
    </div>
  );
}
