import React, { useState } from 'react';
import { Bell, Loader2, Send, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { auth } from '../../../../lib/firebase';

export const PushNotificationSubTab: React.FC = () => {
  const [isSending, setIsSending] = useState(false);
  const [customTitle, setCustomTitle] = useState('[우주하마 방송 예측] 공지 알림');
  const [customBody, setCustomBody] = useState('새로운 방송 일정 또는 공지사항이 등록되었어요.');
  const [customUrl, setCustomUrl] = useState('/');
  const [lastResult, setLastResult] = useState<any>(null);

  const handleSendNotification = async (isTest = false) => {
    const titleToSend = isTest ? '[우주하마 방송 예측] 테스트 전체 알림' : customTitle.trim();
    const bodyToSend = isTest ? '푸시 알림 수신이 정상적으로 연결되어 있어요.' : customBody.trim();
    const urlToSend = isTest ? '/' : (customUrl.trim() || '/');

    if (!titleToSend || !bodyToSend) {
      alert('알림 제목과 내용을 입력해주세요.');
      return;
    }

    if (!window.confirm(isTest ? '모든 웹 푸시 구독 기기에 테스트 알림을 보낼까요?' : `모든 구독 기기에 다음 알림을 보낼까요?\n\n제목: ${titleToSend}\n내용: ${bodyToSend}`)) {
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        alert('관리자 인증 세션이 만료되었어요. 다시 로그인해주세요.');
        return;
      }

      // 1차: 현재 오리진의 상대 경로(/api/notifications/send) 시도
      // 2차: 외부 Vercel 프로덕션 API URL(https://uzuhama.vercel.app/api/notifications/send) 폴백 시도
      const configuredApi = import.meta.env.VITE_VERCEL_API_URL;
      const targetUrls = configuredApi 
        ? [`${configuredApi.replace(/\/+$/, '')}/api/notifications/send`]
        : ['/api/notifications/send', 'https://uzuhama.vercel.app/api/notifications/send'];

      let res: Response | null = null;
      let lastNetworkError: any = null;

      for (const targetUrl of targetUrls) {
        try {
          const attempt = await fetch(targetUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              title: titleToSend,
              body: bodyToSend,
              url: urlToSend
            })
          });

          // 404가 아닌 응답(200, 400, 403, 500 등)을 받았으면 해당 서버가 처리한 것이므로 채택
          if (attempt.status !== 404) {
            res = attempt;
            break;
          }
        } catch (fetchErr: any) {
          lastNetworkError = fetchErr;
          console.warn(`[Push Notification] Attempt to ${targetUrl} failed:`, fetchErr);
        }
      }

      if (!res) {
        throw new Error(
          lastNetworkError?.message || 
          '알림 서버에 연결할 수 없어요. (CORS 차단 또는 네트워크 연결 상태를 확인해주세요.)'
        );
      }

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || `알림 발송 서버 오류 (상태 코드: ${res.status})`);
      }

      setLastResult(resData);

      if (resData.message && !resData.success && (resData.failureCount === undefined || resData.failureCount === 0)) {
        alert(`⚠️ 알림 발송 안내\n\n${resData.message}`);
        return;
      }

      let alertMsg = `🔔 알림 발송 결과\n\n- 성공: ${resData.successCount ?? 0}대\n- 실패: ${resData.failureCount ?? 0}대`;
      if (resData.cleanedTokens) {
        alertMsg += `\n- 만료/무효 자동 정리: ${resData.cleanedTokens}개`;
      }
      alert(alertMsg);
    } catch (err: any) {
      console.error('푸시 알림 발송 오류:', err);
      const errMsg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err));
      alert(`알림 발송 중 오류:\n\n${errMsg || '네트워크 요청 실패 (CORS 또는 연결 문제)'}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. 빠른 테스트 발송 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <Bell className="w-5 h-5" />
              </span>
              <span>웹 푸시 인프라 연결 점검</span>
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              FCM 푸시 알림을 구독한 모든 기기와 현재 브라우저에 실시간 테스트 알림을 발송하여 알림 인프라 연결 상태를 점검해요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSendNotification(true)}
            disabled={isSending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer active:scale-95"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>발송 중...</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                <span>전체 기기 테스트 알림 발송</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. 맞춤 푸시 알림 작성 및 브로드캐스트 */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100 dark:border-zinc-800">
          <Send className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">사용자 맞춤 푸시 알림 전송</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">알림 제목</label>
            <input
              type="text"
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="예: [우주하마 방송 예측] 긴급 공지"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">알림 본문</label>
            <textarea
              rows={3}
              value={customBody}
              onChange={e => setCustomBody(e.target.value)}
              placeholder="알림 본문 내용을 입력하세요..."
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 text-xs text-zinc-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">클릭 시 이동할 경로 (URL)</label>
            <input
              type="text"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="예: / 또는 https://uzuhama.web.app"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white font-mono"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => handleSendNotification(false)}
              disabled={isSending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md cursor-pointer active:scale-95"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>발송 중...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>전체 사용자에게 푸시 알림 전송</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 직전 발송 결과 리포트 */}
        {lastResult && (
          <div className="mt-4 p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2">
            <div className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>최근 발송 리포트</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-zinc-400 text-[10px]">총 대상</div>
                <div className="font-bold text-sm text-zinc-900 dark:text-white">{lastResult.totalCount ?? 0}대</div>
              </div>
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-emerald-500 text-[10px]">발송 성공</div>
                <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400">{lastResult.successCount ?? 0}대</div>
              </div>
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-red-500 text-[10px]">발송 실패</div>
                <div className="font-bold text-sm text-red-600 dark:text-red-400">{lastResult.failureCount ?? 0}대</div>
              </div>
              <div className="p-2 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="text-purple-500 text-[10px]">만료 토큰 정리</div>
                <div className="font-bold text-sm text-purple-600 dark:text-purple-400">{lastResult.cleanedTokens ?? 0}개</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
