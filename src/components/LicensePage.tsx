import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, ArrowLeft, Type } from 'lucide-react';
import { useState } from 'react';
import licensesData from '../licenses.json';
import { Link } from 'react-router-dom';

export function LicensePage() {
  const [openPackage, setOpenPackage] = useState<string | null>('font-bm-hanna-pro');
  const [searchTerm, setSearchTerm] = useState('');

  const fontMatches = !searchTerm.trim() || 
    '배달의민족 한나체 pro bm hanna pro 우아한형제들 font 폰트 글꼴 ofl sil'.toLowerCase().includes(searchTerm.toLowerCase());

  const filteredEntries = Object.entries(licensesData).filter(([pkgName, details]: [string, any]) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return pkgName.toLowerCase().includes(term) || (details.licenses && String(details.licenses).toLowerCase().includes(term));
  });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[calc(100vh-4rem)]">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <Link to="/" className="p-2 -ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-white">오픈소스 및 폰트 라이선스</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
              {filteredEntries.length + (fontMatches ? 1 : 0)}개
            </span>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="패키지명, 폰트, 라이선스 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {/* 폰트 라이선스 섹션 */}
          {fontMatches && (
            <div className="border border-purple-200 dark:border-purple-900/60 bg-purple-50/20 dark:bg-purple-950/10 rounded-xl overflow-hidden">
              <button 
                onClick={() => setOpenPackage(openPackage === 'font-bm-hanna-pro' ? null : 'font-bm-hanna-pro')}
                className="w-full flex items-center justify-between p-4 bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-100/50 dark:hover:bg-purple-900/30 text-left transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Type className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-zinc-900 dark:text-white text-sm">배달의민족 한나체 Pro & 한나체 Air</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200/60 dark:bg-purple-800/60 text-purple-800 dark:text-purple-200 font-bold">서체</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">저작권자: (주)우아한형제들 | 라이선스: SIL Open Font License (OFL-1.1)</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  {openPackage === 'font-bm-hanna-pro' ? '접기' : '펼치기'}
                </span>
              </button>
              <AnimatePresence>
                {openPackage === 'font-bm-hanna-pro' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-white dark:bg-zinc-950"
                  >
                    <div className="p-4 text-xs text-zinc-600 dark:text-zinc-400 border-t border-purple-100 dark:border-purple-900/40 space-y-2">
                      <p><span className="font-semibold text-zinc-900 dark:text-zinc-200">글꼴 제공사:</span> (주)우아한형제들 (Woowa Brothers Corp.)</p>
                      <p><span className="font-semibold text-zinc-900 dark:text-zinc-200">적용 서체:</span> 배달의민족 한나체 Pro (제목/헤드라인), 배달의민족 한나체 Air (본문/줄글/공지사항)</p>
                      <p><span className="font-semibold text-zinc-900 dark:text-zinc-200">라이선스:</span> SIL Open Font License (OFL-1.1)</p>
                      <p className="leading-relaxed">
                        본 사이트에는 (주)우아한형제들에서 제공한 '배달의민족 한나체 Pro' 및 '배달의민족 한나체 Air'가 적용되어 있습니다. 
                        지적재산권은 (주)우아한형제들에 있으며, 개인 및 기업 사용자를 포함한 모든 사용자에게 무료로 제공되며 자유롭게 수정 및 재배포가 가능합니다. (단, 글꼴 자체의 유료 판매는 금지됩니다.)
                      </p>
                      <div className="pt-2 flex items-center gap-3">
                        <a 
                          href="https://www.woowahan.com/#/fonts" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          우아한형제들 글꼴 공식 사이트 <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          {filteredEntries.map(([pkgName, details]: [string, any]) => {
            const isOpen = openPackage === pkgName;
            return (
              <div key={pkgName} className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden">
                <button 
                  onClick={() => setOpenPackage(isOpen ? null : pkgName)}
                  className="w-full flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors"
                >
                  <div>
                    <h3 className="font-bold text-zinc-900 dark:text-white text-sm">{pkgName}</h3>
                    <p className="text-xs text-zinc-500 mt-1">라이선스: {details.licenses}</p>
                  </div>
                  <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                    {isOpen ? '접기' : '펼치기'}
                  </span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-white dark:bg-zinc-950"
                    >
                      <div className="p-4 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-200 dark:border-zinc-800">
                        {details.publisher && <p className="mb-1"><span className="font-semibold">Publisher:</span> {details.publisher}</p>}
                        {details.repository && (
                          <p className="mb-3">
                            <a href={details.repository} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                              저장소 방문 <ExternalLink className="w-3 h-3" />
                            </a>
                          </p>
                        )}
                        {details.licenseFile && (
                          <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <p className="font-semibold mb-2">라이선스 파일 경로:</p>
                            <p className="text-[10px] break-all bg-zinc-50 dark:bg-zinc-900 p-2 rounded">{details.licenseFile}</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 rounded-b-2xl shrink-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed text-center font-medium">
            본 라이선스 고지는 오픈소스 라이브러리에 국한되며, '우주하마' 관련 영상, 썸네일, 상표권 등의 모든 지적재산권은 원작자 및 플랫폼(치지직, 유튜브)에 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
