import fs from 'fs';
import path from 'path';

export async function GET() {
  const filePath = path.join(process.cwd(), 'public', 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');

  // If NEXT_PUBLIC_API_URL is configured, inject it into the page window
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (rawApiUrl) {
    const cleanUrl = rawApiUrl.replace(/\/$/, '');
    const apiBase = cleanUrl.endsWith('/api') ? cleanUrl : `${cleanUrl}/api`;
    html = html.replace('<head>', `<head><script>window.API_BASE = "${apiBase}";</script>`);
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}

