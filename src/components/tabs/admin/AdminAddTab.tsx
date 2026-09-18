import { useState } from 'react';
import { AppData, BroadcastLog, GameItem } from '../../../types';
import { FileText, Save, Settings, Edit3, Plus, Film } from 'lucide-react';
import { LogEditorForm } from './LogEditorForm';
import { AdminMolabogiSection } from './AdminMolabogiSection';
import { format } from 'date-fns';

const createEmptyLog = (): Partial<BroadcastLog> => ({
  date: format(new Date(), 'yyyy-MM-dd'),
  time: '',
  endTime: '',
  game: '',
  games: [{ name: '', link: '', category: '' }],
  category: '',
  vods: [{ title: '우주하마 생방송!', url: '', category: '' }],
  edited: [],
  shorts: [],
  durationHours: 0
});

const cleanTime = (t: string, originalLine?: string) => {
  const match = t.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2];
    
    let isAM = originalLine ? /AM|오전/i.test(originalLine) : false;
    let isPM = originalLine ? /PM|오후/i.test(originalLine) : false;
    
    if (isAM) {
      if (h === 12) h = 0;
    } else if (isPM) {
      if (h < 12) h += 12;
    } else {
      if (h < 12) h += 12;
    }
    
    return `${h.toString().padStart(2, '0')}:${m.padStart(2, '0')}`;
  }
  return t;
};

export function AdminAddTab({ 
  onAddLog, 
  onUpdateLog, 
  data 
}: { 
  onAddLog: (log: BroadcastLog) => Promise<void>, 
  onUpdateLog?: (log: BroadcastLog) => Promise<void>, 
  data: AppData 
}) {
  const [entryMode, setEntryMode] = useState<'standard' | 'molabogi'>('standard');
  const [rawText, setRawText] = useState('');
  const [parsedLogs, setParsedLogs] = useState<Partial<BroadcastLog>[]>([createEmptyLog()]);

  const handleParse = () => {
    try {
      const trimmedText = rawText.trim();
      
      // 1. JSON 형식 데이터 입력 시 직접 JSON 파싱 지원
      if (trimmedText.startsWith('{') || trimmedText.startsWith('[')) {
        try {
          const jsonParsed = JSON.parse(trimmedText);
          const rawList = Array.isArray(jsonParsed) ? jsonParsed : [jsonParsed];
          const parsedFromJson: Partial<BroadcastLog>[] = rawList.map((item: any) => {
            const empty = createEmptyLog();
            
            // games 배열 정규화 (게임 이름과 카테고리가 섞이지 않도록 엄격 분리)
            let parsedGames: GameItem[] = [];
            if (Array.isArray(item.games) && item.games.length > 0) {
              parsedGames = item.games.map((g: any) => {
                if (typeof g === 'string') {
                  return { name: g, link: '', category: item.category || '종합' };
                }
                const nameStr = g.name || g.game || '';
                const catStr = g.category || item.category || '종합';
                return {
                  name: nameStr,
                  link: g.link || '',
                  category: catStr
                };
              });
            } else if (item.game) {
              const gameNames = typeof item.game === 'string' ? item.game.split(',').map((s: string) => s.trim()).filter(Boolean) : [String(item.game)];
              parsedGames = gameNames.map((gn: string) => ({
                name: gn,
                link: '',
                category: item.category || '종합'
              }));
            }

            const gameStr = item.game || parsedGames.map(g => g.name).filter(Boolean).join(', ');
            const categoryStr = item.category || (parsedGames[0]?.category) || '종합';

            return {
              ...empty,
              ...item,
              category: categoryStr,
              game: gameStr,
              games: parsedGames,
              vods: Array.isArray(item.vods) ? item.vods : [],
              edited: Array.isArray(item.edited) ? item.edited : [],
              shorts: Array.isArray(item.shorts) ? item.shorts : [],
              absenceReasons: Array.isArray(item.absenceReasons) ? item.absenceReasons : []
            };
          });

          if (parsedFromJson.length > 0) {
            setParsedLogs(parsedFromJson);
            return;
          }
        } catch (jsonErr) {
          // JSON 파싱 실패 시 아래의 라인별 일반 텍스트 파싱 진행
        }
      }

      // 2. 일반 텍스트 라인 파싱
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const newLogs: Partial<BroadcastLog>[] = [];
      let currentLog: Partial<BroadcastLog> | null = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let processedDateLine = false;
        let workLine = line.replace(/^[•\-\*]\s*/, '').trim();
        
        if (workLine.match(/^\d{1,2}\/\d{1,2}/) || workLine.match(/^\d{4}-\d{2}-\d{2}/)) {
          if (currentLog) {
            if (!currentLog.durationHours && currentLog.time && currentLog.endTime) {
              const [sh, sm] = currentLog.time.split(':').map(Number);
              const [eh, em] = currentLog.endTime.split(':').map(Number);
              let diffMins = (eh * 60 + em) - (sh * 60 + sm);
              if (diffMins < 0) diffMins += 24 * 60;
              currentLog.durationHours = Number((diffMins / 60).toFixed(2));
            }
            currentLog.games = currentLog.games?.filter(g => g.name || g.link) || [];
            newLogs.push(currentLog);
          }
          currentLog = createEmptyLog();
          currentLog.games = []; 
          
          const dateStr = workLine.split(' ')[0];
          if (dateStr.includes('/')) {
            const [m, d] = dateStr.split('/');
            const year = new Date().getFullYear();
            currentLog.date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          } else {
            currentLog.date = dateStr;
          }
          processedDateLine = true;
        }

        if (!currentLog) {
          currentLog = createEmptyLog();
          currentLog.games = [];
        }

        if (workLine.includes('~') && workLine.match(/\d{1,2}:\d{2}/)) {
          const timeMatch = workLine.match(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/);
          if (timeMatch) {
            currentLog.time = cleanTime(timeMatch[1], workLine);
            currentLog.endTime = cleanTime(timeMatch[2], workLine);
          } else {
            const parts = workLine.split('~');
            if (parts.length >= 2) {
              const startPart = parts[0].match(/\d{1,2}:\d{2}/);
              const endPart = parts[1].match(/\d{1,2}:\d{2}/);
              if (startPart) currentLog.time = cleanTime(startPart[0], parts[0]);
              if (endPart) currentLog.endTime = cleanTime(endPart[0], parts[1]);
            }
          }
        }

        if (/(\d+시간)|(\d+분)/.test(workLine)) {
          const hMatch = workLine.match(/(\d+)시간/);
          const mMatch = workLine.match(/(\d+)분/);
          const h = hMatch ? parseInt(hMatch[1]) : 0;
          const m = mMatch ? parseInt(mMatch[1]) : 0;
          currentLog.durationHours = Number((h + (m / 60)).toFixed(2));
        }

        if (processedDateLine) continue;

        const durationClean = workLine.replace(/\s+/g, '');
        if (/^(?:\d+시간)?(?:\d+분)?$/.test(durationClean) && durationClean.length > 0) continue;
        if (workLine.includes('~') && !workLine.match(/[a-zA-Z가-힣]/) && workLine.includes(':')) continue;

        if (line.startsWith('[') && line.endsWith(']')) {
          const cat = line.slice(1, -1);
          if (!currentLog.games) currentLog.games = [];
          if (currentLog.games.length > 0 && (!currentLog.games[currentLog.games.length - 1].category || currentLog.games[currentLog.games.length - 1].category === '종합')) {
            currentLog.games[currentLog.games.length - 1].category = cat;
          } else {
            currentLog.games.push({ name: '', link: '', category: cat });
          }
          continue;
        }

        if (line.startsWith('▶') || line.startsWith('-')) {
          const text = line.replace(/^[▶-]\s*/, '').trim();
          currentLog.edited?.push({ title: text, url: '' });
          continue;
        }
        
        let cat = '';
        let gameName = line;
        const catMatch = line.match(/\[(.*?)\]/);
        if (catMatch) {
            cat = catMatch[1];
            gameName = line.replace(catMatch[0], '').trim();
        }

        if (!currentLog.games) currentLog.games = [];
        if (gameName) {
          if (currentLog.games.length > 0 && !currentLog.games[currentLog.games.length - 1].name) {
            currentLog.games[currentLog.games.length - 1].name = gameName;
            if (cat) {
              currentLog.games[currentLog.games.length - 1].category = cat;
            }
          } else {
            currentLog.games.push({ name: gameName, link: '', category: cat });
          }
        } else if (cat) {
          // 게임 이름 없이 카테고리만 있는 경우, 게임 이름으로 쓰지 않고 카테고리만 할당
          if (currentLog.games.length > 0) {
            currentLog.games[currentLog.games.length - 1].category = cat;
          } else {
            currentLog.games.push({ name: '', link: '', category: cat });
          }
        }
        currentLog.game = currentLog.games.map(g => g.name).filter(Boolean).join(', ');
      }

      if (currentLog) {
        if (!currentLog.durationHours && currentLog.time && currentLog.endTime) {
          const [sh, sm] = currentLog.time.split(':').map(Number);
          const [eh, em] = currentLog.endTime.split(':').map(Number);
          let diffMins = (eh * 60 + em) - (sh * 60 + sm);
          if (diffMins < 0) diffMins += 24 * 60;
          currentLog.durationHours = Number((diffMins / 60).toFixed(2));
        }
        currentLog.games = currentLog.games?.filter(g => g.name || g.link) || [];
        newLogs.push(currentLog);
      }

      if (newLogs.length > 0) {
        setParsedLogs(newLogs);
      } else {
        alert("인식된 데이터가 없습니다.");
      }
    } catch (e) {
      alert("파싱에 실패했습니다. 형식에 맞게 텍스트를 입력해주세요.");
    }
  };

  const handleSaveParsedLogs = async () => {
    for (const log of parsedLogs) {
      if (!log.date || !log.time) {
        alert('날짜와 시간은 필수입니다.');
        return;
      }
    }
    
    for (const log of parsedLogs) {
      const newLog = {
        ...log,
        id: log.id || Date.now().toString() + Math.random().toString(36).substr(2, 9)
      } as BroadcastLog;
      await onAddLog(newLog);
    }

    alert('모든 데이터가 성공적으로 저장되었습니다.');
    setParsedLogs([createEmptyLog()]);
    setRawText('');
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-sm space-y-6">
      {/* 서브 모드 전환 탭 */}
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4 flex-wrap">
        <div className="flex items-center gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
          <button
            type="button"
            onClick={() => setEntryMode('standard')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              entryMode === 'standard'
                ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Edit3 className="w-4 h-4" />
            일반 방송 기록 추가
          </button>
          <button
            type="button"
            onClick={() => setEntryMode('molabogi')}
            className={`px-3.5 py-2 text-xs sm:text-sm font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              entryMode === 'molabogi'
                ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Film className="w-4 h-4" />
            몰아보기 영상 등록 (생방/게임 연동)
          </button>
        </div>

        <div className="text-xs text-zinc-500">
          {entryMode === 'standard' ? '텍스트 파싱 및 수동 방송 등록' : '여러 생방을 묶어 편집된 몰아보기 영상 연동'}
        </div>
      </div>

      {entryMode === 'molabogi' ? (
        <AdminMolabogiSection data={data} onUpdateLog={onUpdateLog} />
      ) : (
        <div>
          <h3 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            신규 방송 기록 대량 입력 (직접 입력 & 기본 필드)
          </h3>
             
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 sm:p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-4 h-4 text-zinc-500" />
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">대량 텍스트 입력 (스마트 자동 분류)</label>
                </div>
                <textarea 
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`여러 날짜의 기록을 한 번에 붙여넣으세요.\n\n1/8 (목)\n10:01 ~ AM 1:18\n3시간 17분\n간장 라멘 포에버\n[소통]\n▶ 풀영상 제목 (다시보기)\n▶ 편집본 쇼츠 제목`}
                  className="w-full h-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 box-border"
                />
              </div>
              <button 
                onClick={handleParse}
                className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                스마트 자동 분류
              </button>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-zinc-500" />
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">입력 항목 ({parsedLogs.length}개)</h4>
                  </div>
                  <button onClick={() => setParsedLogs([...parsedLogs, createEmptyLog()])} className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 bg-purple-50 dark:bg-purple-900/30 px-3 py-1 rounded-full flex items-center gap-1">
                    <Plus className="w-3 h-3" /> 항목 추가
                  </button>
                </div>
                <button onClick={handleSaveParsedLogs} className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" />
                  모두 저장하기
                </button>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[600px] pr-2 space-y-6">
                {parsedLogs.map((log, index) => (
                  <LogEditorForm 
                    key={index} 
                    log={log} 
                    system={data.system}
                    onChange={updates => {
                      const updated = [...parsedLogs];
                      updated[index] = { ...updated[index], ...updates };
                      setParsedLogs(updated);
                    }}
                    onDelete={parsedLogs.length > 1 ? () => {
                      const updated = [...parsedLogs];
                      updated.splice(index, 1);
                      setParsedLogs(updated);
                    } : undefined}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
