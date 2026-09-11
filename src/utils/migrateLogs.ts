import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { BroadcastLog } from '../types';

export interface MigrationProgress {
  totalLogs: number;
  totalMonths: number;
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
}

/**
 * 기존 logs 컬렉션의 모든 문서를 읽어 date 필드의 YYYY-MM을 기준으로 그룹화한 뒤,
 * 신규 컬렉션인 logs_by_month 문서(문서 ID: YYYY-MM, 내부 items: { [logId]: logData })로 일괄 이관합니다.
 */
export async function migrateLogsToMonthly(
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; totalLogs: number; totalMonths: number; message: string }> {
  try {
    if (onProgress) {
      onProgress({
        totalLogs: 0,
        totalMonths: 0,
        status: 'running',
        message: '기존 logs 컬렉션 문서를 조회 중입니다...'
      });
    }

    const logsSnapshot = await getDocs(collection(db, 'logs'));
    const totalLogs = logsSnapshot.size;

    if (totalLogs === 0) {
      const result = {
        success: true,
        totalLogs: 0,
        totalMonths: 0,
        message: '이관할 기존 로그가 없습니다.'
      };
      if (onProgress) onProgress({ ...result, status: 'success' });
      return result;
    }

    // YYYY-MM 별로 그룹화
    const monthGroups: Record<string, Record<string, BroadcastLog>> = {};

    logsSnapshot.forEach((docSnap) => {
      const data = docSnap.data() as BroadcastLog;
      const logId = docSnap.id || data.id;
      const logData: BroadcastLog = { ...data, id: logId };

      const dateStr = logData.date || '';
      const monthKey = dateStr.slice(0, 7); // 예: "2026-03"
      if (!monthKey || monthKey.length < 7) return;

      if (!monthGroups[monthKey]) {
        monthGroups[monthKey] = {};
      }
      monthGroups[monthKey][logId] = logData;
    });

    const monthKeys = Object.keys(monthGroups).sort();
    let completedMonths = 0;

    for (const monthKey of monthKeys) {
      const monthDocRef = doc(db, 'logs_by_month', monthKey);
      await setDoc(
        monthDocRef,
        {
          month: monthKey,
          updatedAt: new Date().toISOString(),
          items: monthGroups[monthKey]
        },
        { merge: true }
      );
      completedMonths++;

      if (onProgress) {
        onProgress({
          totalLogs,
          totalMonths: monthKeys.length,
          status: 'running',
          message: `${monthKey} 월별 묶음 저장 중 (${completedMonths}/${monthKeys.length})...`
        });
      }
    }

    const msg = `성공적으로 ${totalLogs}개의 로그를 ${monthKeys.length}개 월별 문서(logs_by_month)로 이관 완료했습니다.`;
    if (onProgress) {
      onProgress({
        totalLogs,
        totalMonths: monthKeys.length,
        status: 'success',
        message: msg
      });
    }
    return { success: true, totalLogs, totalMonths: monthKeys.length, message: msg };
  } catch (error: any) {
    console.error('migrateLogsToMonthly error:', error);
    const errorMsg = `이관 중 오류 발생: ${error?.message || error}`;
    if (onProgress) {
      onProgress({ totalLogs: 0, totalMonths: 0, status: 'error', message: errorMsg });
    }
    return { success: false, totalLogs: 0, totalMonths: 0, message: errorMsg };
  }
}
