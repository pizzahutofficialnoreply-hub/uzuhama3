import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import licensesData from '../licenses.json';
import { Link } from 'react-router-dom';

export function LicensePage() {
  const [openPackage, setOpenPackage] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8">
      <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-[calc(100vh-4rem)]">
        
        <div className="flex items-center gap-4 p-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <Link to="/" className="p-2 -ml-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">오픈소스 라이선스</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
          {Object.entries(licensesData).map(([pkgName, details]: [string, any]) => {
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
