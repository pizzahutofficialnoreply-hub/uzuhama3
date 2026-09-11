import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, orderBy, limit, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD33dUT30Gn5Vr2OKA_X3sI1HAddVsMZoM",
  authDomain: "uzuhama.firebaseapp.com",
  projectId: "uzuhama",
  storageBucket: "uzuhama.firebasestorage.app",
  messagingSenderId: "8322844637",
  appId: "1:8322844637:web:85ed5c72a675f66adad834",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const CHZZK_CHANNEL_ID = 'c6e1c8cf1b128bd321cc2684c92b5a00';
const CHZZK_API_URL = `https://api.chzzk.naver.com/service/v2/channels/${CHZZK_CHANNEL_ID}/live-detail`;

async function run() {
  try {
    const res = await fetch(CHZZK_API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const data = await res.json();
    const content = data.content;
    const status = content?.status; // "OPEN" or "CLOSE"

    // Get previous state from live_status document
    const liveStatusRef = doc(db, 'live_status', CHZZK_CHANNEL_ID);
    const snap = await getDocs(query(collection(db, 'live_status'), where('__name__', '==', CHZZK_CHANNEL_ID))); // Workaround for simple getDoc if not imported
    
    // Proper way to get previous document state
    const { getDoc } = await import('firebase/firestore');
    const liveStatusSnap = await getDoc(liveStatusRef);
    const prevStatusData = liveStatusSnap.exists() ? liveStatusSnap.data() : null;
    const prevStatus = prevStatusData?.status;

    if (status === 'OPEN') {
      // Update live_status, DO NOT create log yet
      await setDoc(liveStatusRef, {
        status: 'OPEN',
        liveTitle: content?.liveTitle || '',
        liveCategoryValue: content?.liveCategoryValue || '',
        openDate: content?.openDate || '',
        updatedAt: new Date().toISOString()
      });
      console.log('Updated live status to OPEN');
    } else if (status === 'CLOSE') {
      // If previous status was OPEN, it means broadcast just ended
      if (prevStatus === 'OPEN') {
        const now = new Date();
        const endTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const openDateStr = prevStatusData.openDate;
        let openDate = now;
        let durationHours = 0;
        let timeStr = '00:00';
        let dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        if (openDateStr) {
          openDate = new Date(openDateStr.replace(' ', 'T') + '+09:00');
          const diffMs = now.getTime() - openDate.getTime();
          durationHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
          timeStr = `${String(openDate.getHours()).padStart(2, '0')}:${String(openDate.getMinutes()).padStart(2, '0')}`;
          dateStr = `${openDate.getFullYear()}-${String(openDate.getMonth()+1).padStart(2, '0')}-${String(openDate.getDate()).padStart(2, '0')}`;
        }
        
        // Generate new log
        const logsRef = collection(db, 'logs');
        const newLog = {
          id: Date.now().toString(), // Use timestamp as ID to prevent overwriting
          date: dateStr,
          time: timeStr,
          endTime: endTimeStr,
          durationHours: durationHours > 0 ? durationHours : 0,
          game: prevStatusData.liveCategoryValue || '종합',
          category: prevStatusData.liveCategoryValue || '종합',
          games: [{ name: prevStatusData.liveCategoryValue || '종합', category: '종합', link: '' }],
          vods: [],
          edited: [],
          shorts: []
        };
        await setDoc(doc(logsRef, newLog.id), newLog);
        console.log('Broadcast ended. Auto-generated new log:', newLog.id);
      }
      
      // Update live_status to CLOSE and reset data
      await setDoc(liveStatusRef, {
        status: 'CLOSE',
        liveTitle: '',
        liveCategoryValue: '',
        openDate: '',
        updatedAt: new Date().toISOString()
      });
      console.log('Updated live status to CLOSE');
    }
    
    // Explicitly exit so the process doesn't hang due to Firebase timers
    process.exit(0);
  } catch(e) {
    console.error('Error in tracker:', e);
    process.exit(1);
  }
}

run();