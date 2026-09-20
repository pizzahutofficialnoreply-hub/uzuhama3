import { setCorsHeaders, db } from '../_firebase';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }
    }

    const { pollId, voterId, action = 'vote', selectedOptions, previousOptions } = payload || {};

    if (!pollId || typeof pollId !== 'string') {
      return res.status(400).json({ error: 'Invalid pollId' });
    }

    // 1. /polls/{pollId} 문서 가져오기
    const pollDocRef = db.collection('polls').doc(pollId);
    const pollSnap = await pollDocRef.get();

    let pollData: any = null;

    if (pollSnap.exists) {
      pollData = pollSnap.data();
    } else {
      // 2. /config/system의 activePoll에서 fallback 가져오기
      const sysSnap = await db.collection('config').doc('system').get();
      if (sysSnap.exists) {
        const sysData = sysSnap.data();
        if (sysData?.activePoll?.id === pollId) {
          pollData = sysData.activePoll;
        }
      }
    }

    if (!pollData) {
      return res.status(404).json({ error: 'Poll not found' });
    }

    const currentOptions: Array<{ id: string; text: string; votes: number }> = 
      (pollData.options || []).map((o: any) => ({
        id: String(o.id),
        text: String(o.text || ''),
        votes: Math.max(0, Number(o.votes) || 0)
      }));

    const validOptionIds = new Set(currentOptions.map(o => o.id));

    // 클라이언트 IP 추출 (비로그인 1인 1투표 중복 방지 식별 용도)
    // [개인정보 보호 원칙]: IP 주소는 오직 공정한 중복 투표 방지 식별 키로만 사용되며,
    // 위치 추적, 개인 신원 조회 등은 일절 수행하지 않으며 시스템상 불가능합니다.
    const forwarded = req.headers['x-forwarded-for'];
    let clientIp = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.substring(7);
    const cleanIp = clientIp.replace(/[^a-zA-Z0-9]/g, '_');

    // 유권자(Voter) 식별자 확인 (계정 단위 또는 IP 단위)
    const safeVoterId = (typeof voterId === 'string' && voterId.trim().length > 0)
      ? voterId.trim().slice(0, 64)
      : `ip_${cleanIp}`;

    let existingVoterDoc: any = null;
    let voterDocRef: any = null;

    if (safeVoterId) {
      voterDocRef = pollDocRef.collection('voters').doc(safeVoterId);
      const voterSnap = await voterDocRef.get();
      if (voterSnap.exists) {
        existingVoterDoc = voterSnap.data();
      }
    }

    // ==========================================
    // ACTION: CANCEL (투표 취소)
    // ==========================================
    if (action === 'cancel') {
      // 취소할 항목 결정 (이전 기록이 있으면 그 기록 기준, 없으면 전달된 previousOptions/selectedOptions)
      const optionsToDeduct: string[] = 
        (existingVoterDoc?.active && Array.isArray(existingVoterDoc?.selectedOptions))
          ? existingVoterDoc.selectedOptions
          : (Array.isArray(previousOptions) ? previousOptions : (Array.isArray(selectedOptions) ? selectedOptions : []));

      const filteredToDeduct = optionsToDeduct.filter(id => validOptionIds.has(id));

      if (filteredToDeduct.length === 0 && (!existingVoterDoc || !existingVoterDoc.active)) {
        // 이미 취소되었거나 취소할 항목이 없음
        return res.status(200).json({ 
          success: true, 
          message: '이미 투표가 취소되었거나 취소할 내역이 없습니다.',
          poll: pollData 
        });
      }

      // 데이터베이스에서 득표수 차감 (음수 방지)
      let deductedCount = 0;
      const updatedOptions = currentOptions.map(opt => {
        if (filteredToDeduct.includes(opt.id)) {
          const newVotes = Math.max(0, opt.votes - 1);
          if (newVotes < opt.votes) deductedCount++;
          return { ...opt, votes: newVotes };
        }
        return opt;
      });

      const newTotalVotes = Math.max(0, (pollData.totalVotes || 0) - deductedCount);

      const updatedPoll = {
        ...pollData,
        options: updatedOptions,
        totalVotes: newTotalVotes,
        updatedAt: new Date().toISOString()
      };

      // /polls/{pollId} 저장 (데이터베이스에는 깔끔하게 값만 저장)
      await pollDocRef.set(updatedPoll, { merge: true });

      // 유권자 기록 취소 상태로 갱신
      if (voterDocRef) {
        await voterDocRef.set({
          active: false,
          selectedOptions: [],
          cancelledAt: new Date().toISOString(),
          lastAction: 'cancel'
        }, { merge: true });
      }

      // /config/system 동기화
      try {
        const sysSnap = await db.collection('config').doc('system').get();
        if (sysSnap.exists && sysSnap.data()?.activePoll?.id === pollId) {
          await db.collection('config').doc('system').set({
            activePoll: updatedPoll
          }, { merge: true });
        }
      } catch (sysErr) {
        console.warn('[Poll Cancel] System config sync warning:', sysErr);
      }

      return res.status(200).json({ success: true, poll: updatedPoll, cancelled: true });
    }

    // ==========================================
    // ACTION: VOTE (투표 또는 변경 다시 하기)
    // ==========================================
    if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
      return res.status(400).json({ error: '선택된 투표 항목이 없습니다.' });
    }

    // 복수 투표 허용 여부 체크
    let safeSelected = selectedOptions.filter(id => validOptionIds.has(id));
    if (!pollData.allowMultiple && safeSelected.length > 1) {
      safeSelected = [safeSelected[0]];
    }

    if (safeSelected.length === 0) {
      return res.status(400).json({ error: '유효한 투표 항목을 선택해주세요.' });
    }

    // 기존 투표 이력이 있는 경우, 이전 선택된 옵션을 안전하게 차감하고 신규 옵션으로 부드럽게 갱신 (24시간 제한 삭제)
    const prevSelected: string[] = (existingVoterDoc && existingVoterDoc.active && Array.isArray(existingVoterDoc.selectedOptions))
      ? existingVoterDoc.selectedOptions
      : [];

    const updatedOptions = currentOptions.map(opt => {
      let v = opt.votes || 0;
      if (prevSelected.includes(opt.id)) {
        v = Math.max(0, v - 1);
      }
      if (safeSelected.includes(opt.id)) {
        v = v + 1;
      }
      return { ...opt, votes: v };
    });

    const newTotalVotes = updatedOptions.reduce((sum, o) => sum + o.votes, 0);

    const updatedPoll = {
      ...pollData,
      options: updatedOptions,
      totalVotes: newTotalVotes,
      updatedAt: new Date().toISOString()
    };

    // 1. /polls/{pollId} 문서 저장 (데이터베이스에는 값만 깔끔하게 저장)
    await pollDocRef.set(updatedPoll, { merge: true });

    // 2. 조작 방지용 유권자 문서 기록
    if (voterDocRef) {
      await voterDocRef.set({
        active: true,
        selectedOptions: safeSelected,
        votedAt: new Date().toISOString(),
        votedTimestamp: Date.now(),
        lastAction: 'vote'
      }, { merge: true });
    }

    // 3. /config/system 동기화
    try {
      const sysSnap = await db.collection('config').doc('system').get();
      if (sysSnap.exists && sysSnap.data()?.activePoll?.id === pollId) {
        await db.collection('config').doc('system').set({
          activePoll: updatedPoll
        }, { merge: true });
      }
    } catch (sysErr) {
      console.warn('[Poll Vote] System config sync warning:', sysErr);
    }

    return res.status(200).json({ success: true, poll: updatedPoll });
  } catch (error: any) {
    console.error('[Poll Vote Error]', error);
    return res.status(500).json({
      error: error?.message || 'Failed to submit vote'
    });
  }
}

