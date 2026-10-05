import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import console from 'node:console';
const server = createServer((request, response) => {
  const fixture =
    request.url?.split('?')[0] === '/compose' ? 'compose' : 'fields';
  void readFile(
    new URL('../tests/fixtures/' + fixture + '.html', import.meta.url),
  )
    .then((html) => {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(html);
    })
    .catch(() => {
      response.writeHead(500);
      response.end('Fixture indisponible');
    });
});
server.listen(8080, '127.0.0.1', () =>
  console.info('Page de test : http://127.0.0.1:8080'),
);
server.on('error', (error) => console.error(error.message));
