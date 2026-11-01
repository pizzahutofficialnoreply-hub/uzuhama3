import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

function calendarFeedPlugin() {
  return {
    name: 'calendar-feed-plugin',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const url = req.url || '';

        // 푸시 알림 발송 API (로컬 및 프리뷰 환경 지원)
        if (url === '/api/notifications/send' || url.startsWith('/api/notifications/send?')) {
          if (req.method === 'POST') {
            try {
              let bodyStr = '';
              req.on('data', (chunk: any) => { bodyStr += chunk; });
              req.on('end', async () => {
                try {
                  const { default: sendHandler } = await import('./api/notifications/send');
                  req.body = bodyStr ? JSON.parse(bodyStr) : {};
                  const mockRes: any = {
                    statusCode: 200,
                    status(code: number) {
                      res.statusCode = code;
                      return mockRes;
                    },
                    json(data: any) {
                      res.setHeader('Content-Type', 'application/json');
                      return res.end(JSON.stringify(data));
                    },
                    end(data?: any) {
                      return res.end(data);
                    },
                    setHeader(k: string, v: string) {
                      res.setHeader(k, v);
                      return mockRes;
                    }
                  };
                  await sendHandler(req, mockRes);
                } catch (e: any) {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 500;
                  return res.end(JSON.stringify({ error: e.message || '알림 발송 처리 실패' }));
                }
              });
              return;
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }
          }
        }

        if (
          url === '/api/calendar.ics' || 
          url === '/api/calendar' || 
          url === '/feed.ics' || 
          url.startsWith('/api/calendar.ics?') || 
          url.startsWith('/api/calendar?') ||
          url.startsWith('/feed.ics?')
        ) {
          try {
            const { buildFullCalendarFeed } = await import('./api/calendar');
            const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
            const proto = req.headers['x-forwarded-proto'] || 'http';
            const origin = `${proto}://${host}`;
            const icsContent = await buildFullCalendarFeed(origin);

            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', 'inline; filename="uzuhama_calendar.ics"');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.statusCode = 200;
            return res.end(icsContent);
          } catch (e: any) {
            console.error('[Calendar Dev Middleware Error]:', e);
            res.statusCode = 500;
            return res.end('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Error//EN\r\nEND:VCALENDAR');
          }
        }
        next();
      });
    },
    // 정적 .ics 파일은 만들지 않음: 빌드 시점 사본이 실시간 피드(/api/calendar.ics)를 가려 업데이트가 안 보이던 원인
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      calendarFeedPlugin()
    ],
    build: {
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // 자주 바뀌지 않는 라이브러리를 따로 묶어 배포 후에도 브라우저 캐시를 재사용
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'vendor-charts';
            if (id.includes('motion') || id.includes('framer')) return 'vendor-motion';
            if (id.includes('react-markdown') || id.includes('remark') || id.includes('micromark') || id.includes('mdast') || id.includes('hast') || id.includes('unified')) return 'vendor-markdown';
            if (id.includes('/react') || id.includes('scheduler')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      headers: {
        'Cross-Origin-Opener-Policy': 'unsafe-none',
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
