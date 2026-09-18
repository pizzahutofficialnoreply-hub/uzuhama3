import { BroadcastLog, LinkItem, SystemConfig } from "../../../types";
import { X, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

const COMMON_ABSENCE_REASONS = [
  "개인 사정",
  "건강 문제/컨디션 난조",
  "인터넷/장비 이슈",
  "가족 행사/일정",
  "지각",
  "기타 (직접 입력)",
];

interface CategoryMultiSelectorProps {
  link: LinkItem;
  availableGames: string[];
  onUpdate: (updatedLink: LinkItem) => void;
}

const CategoryMultiSelector = ({
  link,
  availableGames,
  onUpdate,
}: CategoryMultiSelectorProps) => {
  const [customInput, setCustomInput] = useState("");
  const [showInput, setShowInput] = useState(false);

  // 현재 선택된 카테고리 파싱 (배열 우선, 없으면 쉼표 분리)
  const selectedList = (() => {
    if (Array.isArray(link.categories) && link.categories.length > 0) {
      return link.categories;
    }
    if (link.category) {
      return link.category.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return [];
  })();

  // 기본 후보 + 게임 목록 + 이미 선택된 커스텀 값들
  const defaultPresets = ["노가리", "종합"];
  const candidateSet = new Set<string>([
    ...availableGames.filter(Boolean),
    ...defaultPresets,
    ...selectedList,
  ]);
  const candidates = Array.from(candidateSet);

  const toggleCategory = (cat: string) => {
    let next: string[];
    if (selectedList.includes(cat)) {
      next = selectedList.filter((c) => c !== cat);
    } else {
      next = [...selectedList, cat];
    }
    onUpdate({
      ...link,
      categories: next,
      category: next.join(', '),
    });
  };

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (!selectedList.includes(trimmed)) {
      const next = [...selectedList, trimmed];
      onUpdate({
        ...link,
        categories: next,
        category: next.join(', '),
      });
    }
    setCustomInput("");
    setShowInput(false);
  };

  return (
    <div className="flex flex-col gap-1.5 mt-1 pt-1.5 border-t border-zinc-100 dark:border-zinc-800/60">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          카테고리 선택 (복수 선택 가능):
        </span>
        {selectedList.length > 0 && (
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
            {selectedList.length}개 선택됨: {selectedList.join(', ')}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {candidates.map((cat) => {
          const isSelected = selectedList.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              className={`px-2 py-0.5 rounded-md text-xs font-medium transition-all ${
                isSelected
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              {isSelected ? `✓ ${cat}` : cat}
            </button>
          );
        })}

        {showInput ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                } else if (e.key === "Escape") {
                  setShowInput(false);
                }
              }}
              placeholder="직접 입력"
              className="bg-white dark:bg-zinc-950 border border-purple-300 dark:border-purple-700 rounded px-1.5 py-0.5 text-xs text-zinc-900 dark:text-white w-24 focus:outline-none focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
            <button
              type="button"
              onClick={handleAddCustom}
              className="px-1.5 py-0.5 bg-purple-600 text-white rounded text-[11px] font-medium hover:bg-purple-700"
            >
              추가
            </button>
            <button
              type="button"
              onClick={() => setShowInput(false)}
              className="p-0.5 text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowInput(true)}
            className="px-1.5 py-0.5 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-md text-[11px] text-zinc-500 hover:text-purple-600 hover:border-purple-400 dark:hover:text-purple-400 transition-colors"
          >
            + 직접 입력
          </button>
        )}
      </div>
    </div>
  );
};

export const LogEditorForm = ({
  log,
  onChange,
  onDelete,
  isExisting,
  system,
}: {
  log: Partial<BroadcastLog>;
  onChange: (updates: Partial<BroadcastLog>) => void;
  onDelete?: () => void;
  isExisting?: boolean;
  system?: SystemConfig;
}) => {
  const availableGames = Array.from(
    new Set([
      ...(log.games?.map((g) => g.name) || []),
      ...(log.game ? [log.game] : []),
    ].filter(Boolean))
  );
  const updateLink = (
    type: "vods" | "edited" | "shorts",
    linkIndex: number,
    link: LinkItem,
  ) => {
    const arr = [...(log[type] || [])];
    arr[linkIndex] = link;
    onChange({ [type]: arr });
  };

  const addLink = (type: "vods" | "edited" | "shorts") => {
    const arr = [...(log[type] || [])];
    arr.push({ title: type === "vods" ? "우주하마 생방송!" : "", url: "" });
    onChange({ [type]: arr });
  };

  const removeLink = (
    type: "vods" | "edited" | "shorts",
    linkIndex: number,
  ) => {
    const arr = [...(log[type] || [])];
    arr.splice(linkIndex, 1);
    onChange({ [type]: arr });
  };

  const moveToShorts = (linkIndex: number) => {
    const editArr = [...(log.edited || [])];
    const link = editArr[linkIndex];
    editArr.splice(linkIndex, 1);

    const shortsArr = [...(log.shorts || [])];
    shortsArr.push(link);

    onChange({ edited: editArr, shorts: shortsArr });
  };

  return (
    <div className="flex flex-col gap-6 p-3.5 sm:p-6 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">날짜</label>
            <input
              type="date"
              value={log.date || ""}
              onChange={(e) => onChange({ date: e.target.value })}
              className="w-full sm:w-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm text-zinc-900 dark:text-white"
            />
          </div>
          {!log.isAbsence && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                방송 시간 (시작~종료)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={log.time || ""}
                  onChange={(e) => onChange({ time: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm text-zinc-900 dark:text-white"
                />
                <span className="text-zinc-500">~</span>
                <input
                  type="time"
                  value={log.endTime || ""}
                  onChange={(e) => onChange({ endTime: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm text-zinc-900 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="self-end sm:self-center text-zinc-400 hover:text-red-500 transition-colors p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!log.isAbsence}
            onChange={(e) => {
              if (e.target.checked) {
                onChange({
                  isAbsence: true,
                  category: "휴방",
                  durationHours: 0,
                });
              } else {
                onChange({
                  isAbsence: false,
                  category: log.category === "휴방" ? "종합" : (log.category || "종합"),
                });
              }
            }}
            className="w-4 h-4 text-purple-600 rounded border-zinc-300 dark:border-zinc-700 focus:ring-purple-500"
          />
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            휴방 기록으로 설정
          </span>
        </label>
      </div>

      {log.isAbsence ? (
        <div className="flex flex-col gap-3 p-4 bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl">
          <label className="block text-xs font-bold text-red-700 dark:text-red-400">
            휴방 사유 (선택 또는 추가 입력)
          </label>
          <div className="flex flex-wrap gap-2">
            {COMMON_ABSENCE_REASONS.map((reason) => {
              const isSelected = (log.absenceReasons || []).includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  onClick={() => {
                    const currentReasons = [...(log.absenceReasons || [])];
                    const nextReasons = isSelected
                      ? currentReasons.filter((r) => r !== reason)
                      : [...currentReasons, reason];
                    onChange({ absenceReasons: nextReasons });
                  }}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors border ${
                    isSelected
                      ? "bg-red-600 text-white border-red-600"
                      : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-red-400"
                  }`}
                >
                  {reason}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            placeholder="기타 사유 직접 입력 (쉼표로 구분 가능)"
            value={(log.absenceReasons || []).filter(r => !COMMON_ABSENCE_REASONS.includes(r)).join(", ")}
            onChange={(e) => {
              const customVals = e.target.value.split(",").map(s => s.trim()).filter(Boolean);
              const predefinedVals = (log.absenceReasons || []).filter(r => COMMON_ABSENCE_REASONS.includes(r));
              onChange({ absenceReasons: [...predefinedVals, ...customVals] });
            }}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm text-zinc-900 dark:text-white"
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                방송 길이(시간)
              </label>
              <input
                type="number"
                step="0.1"
                value={log.durationHours || 0}
                onChange={(e) =>
                  onChange({ durationHours: Number(e.target.value) })
                }
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-sm text-zinc-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-zinc-500 font-bold">
                플레이한 게임 (다중 가능)
              </label>
              <button
                type="button"
                onClick={() => {
                  const currentList = (log.games && log.games.length > 0)
                    ? [...log.games]
                    : (log.game
                        ? [{ name: log.game, link: '', category: log.category || '' }]
                        : []);
                  const nextList = [...currentList, { name: "", link: "", category: "" }];
                  onChange({
                    games: nextList,
                    game: nextList.map((g) => g.name).filter(Boolean).join(", "),
                  });
                }}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 font-bold"
              >
                <Plus className="w-3 h-3" /> 새 게임 추가
              </button>
            </div>

            <div className="space-y-3">
              {((log.games && log.games.length > 0)
                ? log.games
                : [
                    {
                      name: log.game || "",
                      link: "",
                      category: log.category || "",
                    },
                  ]
              ).map((g, gIdx, allGames) => (
                <div
                  key={gIdx}
                  className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      placeholder="게임 이름"
                      value={g.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const nextList = allGames.map((item, idx) => 
                          idx === gIdx ? { ...item, name: newName } : item
                        );
                        onChange({
                          games: nextList,
                          game: nextList.map((item) => item.name).filter(Boolean).join(", "),
                        });
                      }}
                      className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded p-1.5 text-sm text-zinc-900 dark:text-white"
                    />
                    <input
                      type="text"
                      placeholder="카테고리"
                      value={g.category || ""}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        const nextList = allGames.map((item, idx) => 
                          idx === gIdx ? { ...item, category: newCat } : item
                        );
                        onChange({ 
                          games: nextList,
                          ...(gIdx === 0 ? { category: newCat } : {})
                        });
                      }}
                      className="w-24 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded p-1.5 text-sm text-zinc-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextList = allGames.filter((_, idx) => idx !== gIdx);
                        onChange({
                          games: nextList,
                          game: nextList.map((item) => item.name).filter(Boolean).join(", "),
                        });
                      }}
                      title="게임 항목 삭제"
                      className="text-zinc-400 hover:text-red-500 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="url"
                    placeholder="게임 링크 (선택)"
                    value={g.link || ""}
                    onChange={(e) => {
                      const newLink = e.target.value;
                      const nextList = allGames.map((item, idx) => 
                        idx === gIdx ? { ...item, link: newLink } : item
                      );
                      onChange({ games: nextList });
                    }}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded p-1.5 text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            {(["vods", "edited", "shorts"] as const).map((type) => (
              <div key={type}>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    {type === "vods"
                      ? "풀영상 (치지직/유튜브)"
                      : type === "edited"
                        ? "유튜브 편집본"
                        : "유튜브 쇼츠"}
                  </label>
                  <button
                    onClick={() => addLink(type)}
                    className="text-[10px] text-zinc-500 hover:text-purple-600 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> 추가
                  </button>
                </div>

                <div className="space-y-2">
                  {log[type]?.map((link, linkIndex) => (
                    <div
                      key={linkIndex}
                      className="flex flex-col gap-2 p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="제목"
                          value={link.title}
                          onChange={(e) =>
                            updateLink(type, linkIndex, {
                              ...link,
                              title: e.target.value,
                            })
                          }
                          className="flex-1 bg-transparent border-none p-1 text-sm text-zinc-900 dark:text-white focus:ring-0"
                        />
                        {type === "edited" && (
                          <button
                            onClick={() => moveToShorts(linkIndex)}
                            className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
                          >
                            쇼츠로 이동
                          </button>
                        )}
                        <button
                          onClick={() => removeLink(type, linkIndex)}
                          className="text-zinc-400 hover:text-red-500 p-1 shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div>
                        <input
                          type="url"
                          placeholder="URL 링크"
                          value={link.url}
                          onChange={(e) =>
                            updateLink(type, linkIndex, {
                              ...link,
                              url: e.target.value,
                            })
                          }
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded p-1.5 text-xs text-zinc-600 dark:text-zinc-400"
                        />
                      </div>
                      <CategoryMultiSelector
                        link={link}
                        availableGames={availableGames}
                        onUpdate={(updatedLink) => updateLink(type, linkIndex, updatedLink)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
