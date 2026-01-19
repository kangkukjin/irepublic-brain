'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

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

type MapZoomLevel = 'categories' | 'subcategories' | 'posts';

type ViewMode = 'gallery' | 'timeline' | 'map';

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

export default function BrainExplorer() {
  // 상태
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [stats, setStats] = useState<Stats>({ totalPosts: 0, years: 17 });
  const [posts, setPosts] = useState<Post[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthStat[]>([]);
  const [categories, setCategories] = useState<CategoryMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineSummaries, setTimelineSummaries] = useState<TimelineSummaries>({});

  // 타임라인 상태
  const [timelineZoom, setTimelineZoom] = useState<'year' | 'month' | 'day'>('year');
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // 주제(맵) 상태
  const [mapZoom, setMapZoom] = useState<MapZoomLevel>('categories');
  const [selectedMapCategory, setSelectedMapCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

  // 갤러리 페이지네이션
  const [galleryPage, setGalleryPage] = useState(1);
  const postsPerPage = 12;

  // 초기 데이터 로드
  useEffect(() => {
    // 타임라인 요약 데이터 로드
    fetch('/data/timeline-summaries.json')
      .then(r => r.json())
      .then(data => setTimelineSummaries(data))
      .catch(() => console.log('타임라인 요약 데이터 없음'));
  }, []);

  // 뷰 모드 변경 시 데이터 로드 (정적 JSON + 캐시 활용)
  useEffect(() => {
    switch (viewMode) {
      case 'gallery':
        if (cache.posts) {
          setPosts(cache.posts);
          setStats({ totalPosts: cache.posts.length, years: 17 });
          setLoading(false);
          return;
        }
        setLoading(true);
        fetch('/data/posts-light.json')
          .then(r => r.json())
          .then(data => {
            const loadedPosts = data.posts || [];
            cache.posts = loadedPosts;
            setPosts(loadedPosts);
            setStats(data.stats || { totalPosts: 0, years: 17 });
            setGalleryPage(1);
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

  // 주제: 카테고리 선택 시 해당 글 로드
  useEffect(() => {
    if (mapZoom === 'posts' && selectedMapCategory) {
      const filterPosts = (allPosts: Post[]) => {
        if (selectedSubCategory) {
          const fullCategory = `${selectedMapCategory}/${selectedSubCategory}`;
          return allPosts.filter(p => p.category === fullCategory);
        } else {
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

  // 타임라인: 월 선택 시 해당 글 로드
  useEffect(() => {
    if (selectedMonth && timelineZoom === 'day') {
      if (cache.posts) {
        const filtered = cache.posts.filter(p => p.pub_date?.startsWith(selectedMonth));
        setPosts(filtered);
        setLoading(false);
      } else {
        setLoading(true);
        fetch('/data/posts-light.json')
          .then(r => r.json())
          .then(data => {
            const allPosts = data.posts || [];
            cache.posts = allPosts;
            const filtered = allPosts.filter((p: Post) => p.pub_date?.startsWith(selectedMonth));
            setPosts(filtered);
            setLoading(false);
          });
      }
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

    if (cache.posts) {
      const searchLower = searchQuery.toLowerCase();
      const filtered = cache.posts.filter(p => p.title.toLowerCase().includes(searchLower));
      setPosts(filtered);
      setViewMode('gallery');
    }
  }, [searchQuery]);

  // 뷰 모드 정보
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

  return (
    <div className="min-h-screen bg-white">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-6xl mx-auto px-6 md:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              나를 지키는 공간
            </h1>

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

        {/* ========== 갤러리 뷰 ========== */}
        {viewMode === 'gallery' && !loading && (
          <div>
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
                  <button onClick={() => setGalleryPage(1)} className="hover:text-neutral-700 transition-colors">
                    처음
                  </button>
                  <span className="text-neutral-300">{galleryPage} / {totalPages}</span>
                  <button onClick={() => setGalleryPage(totalPages)} className="hover:text-neutral-700 transition-colors">
                    끝
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== 타임라인 뷰 ========== */}
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
                        count > 0 ? 'hover:bg-neutral-50 cursor-pointer' : 'opacity-30 cursor-not-allowed'
                      }`}
                    >
                      <div className="text-lg text-neutral-400">{i + 1}</div>
                      <div className="text-xs text-neutral-300 mt-1">{count || '-'}</div>
                    </button>
                  );
                })}
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

        {/* ========== 주제 뷰 ========== */}
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

            {/* Level 1: 메인 카테고리 목록 */}
            {mapZoom === 'categories' && (
              <div className="space-y-1">
                {categories.map((cat) => (
                  <button
                    key={cat.main}
                    onClick={() => {
                      setSelectedMapCategory(cat.main);
                      const hasSubcategories = cat.subs && cat.subs.some(s => s.name !== null);
                      if (hasSubcategories) {
                        setMapZoom('subcategories');
                      } else {
                        setMapZoom('posts');
                      }
                    }}
                    className="w-full flex items-baseline gap-6 py-4 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors text-left group"
                  >
                    <span className="flex-1 text-neutral-600 group-hover:text-neutral-800 transition-colors">
                      {cat.main}
                    </span>
                    <span className="text-sm text-neutral-300 tabular-nums">{cat.total}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Level 2: 서브카테고리 목록 */}
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
                    <div className="space-y-1">
                      {validSubs.map((sub) => (
                        <button
                          key={sub.name}
                          onClick={() => {
                            setSelectedSubCategory(sub.name!);
                            setMapZoom('posts');
                          }}
                          className="w-full flex items-baseline gap-6 py-4 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors text-left group"
                        >
                          <span className="flex-1 text-neutral-600 group-hover:text-neutral-800 transition-colors">
                            {sub.name}
                          </span>
                          <span className="text-sm text-neutral-300 tabular-nums">{sub.count}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Level 3: 글 목록 */}
            {mapZoom === 'posts' && selectedMapCategory && (
              <div>
                {posts.length === 0 ? (
                  <div className="text-center py-12 text-neutral-400">
                    글이 없습니다
                  </div>
                ) : (
                  <div className="space-y-0 divide-y divide-neutral-100">
                    {posts.map(post => (
                      <Link
                        key={post.post_id}
                        href={`/post/${post.post_id}`}
                        className="group block py-4 hover:bg-neutral-50 -mx-4 px-4 rounded-lg transition-colors"
                      >
                        <div className="flex items-baseline gap-4">
                          <span className="text-sm text-neutral-300 tabular-nums w-24 flex-shrink-0">
                            {post.pub_date?.slice(0, 10)}
                          </span>
                          <span className="flex-1 text-neutral-700 group-hover:text-neutral-900">
                            {post.title}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="mt-8 text-center text-sm text-neutral-400">
                  {posts.length}개의 글
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mt-24 py-8 text-center text-xs text-neutral-300">
        <p>2007 — 2026</p>
      </footer>
    </div>
  );
}
