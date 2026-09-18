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
        if (url === '/api/poll/my-ip' || url.startsWith('/api/poll/my-ip?')) {
          const forwarded = req.headers['x-forwarded-for'];
          let ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');
          if (ip.startsWith('::ffff:')) ip = ip.substring(7);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({ ip }));
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
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
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
    async closeBundle() {
      try {
        const { buildFullCalendarFeed } = await import('./api/calendar');
        const ics = await buildFullCalendarFeed('https://uzuhama.vercel.app');
        const distApi = path.resolve(process.cwd(), 'dist/api');
        if (!fs.existsSync(distApi)) {
          fs.mkdirSync(distApi, { recursive: true });
        }
        fs.writeFileSync(path.join(distApi, 'calendar.ics'), ics, 'utf-8');
        fs.writeFileSync(path.resolve(process.cwd(), 'dist/feed.ics'), ics, 'utf-8');
      } catch (err) {
        console.warn('[Calendar Static Export]:', err);
      }
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      calendarFeedPlugin()
    ],
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
