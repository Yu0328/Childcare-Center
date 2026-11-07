// In-memory Google Drive answering exactly the requests src/sync/driveClient.js makes, so a
// recording syncs for real without a Google account or the network.
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const FILES = '/drive/v3/files';
const UPLOAD = '/upload/drive/v3/files';

// driveClient's queries are `clause and clause …` with: name='x', mimeType='x', 'id' in parents, trashed=false.
function matcher(q) {
  const tests = q.split(/\s+and\s+/).map(clause => {
    let m;
    if ((m = clause.match(/^name\s*=\s*'(.*)'$/))) return f => f.name === m[1];
    if ((m = clause.match(/^mimeType\s*=\s*'(.*)'$/))) return f => f.mimeType === m[1];
    if ((m = clause.match(/^'(.*)'\s+in\s+parents$/))) return f => f.parents.includes(m[1]);
    if (/^trashed\s*=\s*false$/.test(clause)) return f => !f.trashed;
    return null;
  });
  return tests.includes(null) ? null : f => tests.every(t => t(f));
}

// multipart/related: JSON metadata part, then the content part (bytes kept exactly).
function parseMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=([^;]+)/)[1];
  const latin = body.toString('latin1');
  const parts = latin.split(`--${boundary}`).slice(1, -1).map(part => {
    const start = part.indexOf('\r\n\r\n') + 4;
    const end = part.endsWith('\r\n') ? part.length - 2 : part.length;
    return Buffer.from(part.slice(start, end), 'latin1');
  });
  return { metadata: JSON.parse(parts[0].toString('utf-8')), content: parts[1] };
}

const json = (status, obj) => ({ status, contentType: 'application/json', body: JSON.stringify(obj) });

export function createFakeDrive() {
  const files = new Map();
  const unhandled = [];
  let next = 1;

  function create(meta, content = Buffer.alloc(0)) {
    const id = `fake-${next++}`;
    files.set(id, {
      id, name: meta.name || '', mimeType: meta.mimeType || '', parents: meta.parents || [],
      appProperties: meta.appProperties || {}, trashed: false, content, created: id,
    });
    return id;
  }

  function update(id, meta, content) {
    const f = files.get(id);
    if (meta.name !== undefined) f.name = meta.name;
    if (meta.trashed !== undefined) f.trashed = meta.trashed;
    if (meta.appProperties) f.appProperties = { ...f.appProperties, ...meta.appProperties };
    if (content) f.content = content;
  }

  function handle({ method, url, headers, body }) {
    const u = new URL(url);
    const header = name => Object.entries(headers || {}).find(([k]) => k.toLowerCase() === name)?.[1] || '';
    const idMatch = u.pathname.match(/\/files\/([^/]+)$/);
    const id = idMatch && decodeURIComponent(idMatch[1]);
    const known = u.hostname === 'www.googleapis.com';

    if (known && u.pathname === FILES && method === 'GET') {
      const test = matcher(u.searchParams.get('q') || '');
      if (test) {
        const list = [...files.values()].filter(test).map(f => ({ id: f.id, name: f.name, appProperties: f.appProperties }));
        return json(200, { files: list });
      }
    }
    if (known && u.pathname === FILES && method === 'POST') {
      return json(200, { id: create(JSON.parse(body.toString('utf-8'))) });
    }
    if (known && u.pathname.startsWith(`${FILES}/`) && id && files.has(id)) {
      if (method === 'GET' && u.searchParams.get('alt') === 'media') {
        return { status: 200, contentType: 'application/octet-stream', body: files.get(id).content };
      }
      if (method === 'PATCH') {
        update(id, JSON.parse(body.toString('utf-8')));
        return json(200, { id });
      }
    }
    if (known && u.pathname.startsWith(UPLOAD) && u.searchParams.get('uploadType') === 'multipart') {
      const { metadata, content } = parseMultipart(body, header('content-type'));
      if (method === 'POST' && u.pathname === UPLOAD) return json(200, { id: create(metadata, content) });
      if (method === 'PATCH' && id && files.has(id)) {
        update(id, metadata, content);
        return json(200, { id });
      }
    }
    unhandled.push(`${method} ${url}`);
    return json(501, { error: { message: 'not handled by fake Drive' } });
  }

  return { handle, files, unhandled, FOLDER_MIME };
}
