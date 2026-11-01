import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root: string = fileURLToPath(new URL('../dist/', import.meta.url));
const contentTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.csv': 'text/csv; charset=utf-8',
};

const server: Server = createServer(
  async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    try {
      const url: URL = new URL(request.url ?? '/', 'http://127.0.0.1:4173');
      const pathname: string = decodeURIComponent(url.pathname);
      const filename: string = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const data: Buffer = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(filename)] ?? 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404).end('Not found');
    }
  },
);

server.listen({ host: '127.0.0.1', port: 4173, backlog: 1024 }, (): void => {
  console.info('Local: http://127.0.0.1:4173');
});

server.on('error', (error: Error): void => {
  console.error(error.message);
  process.exitCode = 1;
});

function shutdown(): void {
  server.close();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
