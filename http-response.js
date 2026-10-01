import { createHash } from 'node:crypto';
import { brotliCompress, gzip, constants } from 'node:zlib';
import { promisify } from 'node:util';

const br = promisify(brotliCompress), gz = promisify(gzip);
export const CACHE = {
  error: 'no-store', html: 'no-cache', api: 'public, max-age=60, stale-while-revalidate=300',
  assetImmutable: 'public, max-age=31536000, immutable', assetShort: 'public, max-age=300', meta: 'no-cache',
};
export const contentHash = body => createHash('sha256').update(body).digest('hex').slice(0, 12);
export const compressible = type => /^(?:text\/|application\/(?:javascript|json|xml|xhtml\+xml))/i.test(type);
export function chosenEncoding(header = '') {
  const accepted = new Map(String(header).toLowerCase().split(',').map(part => {
    const [name, ...options] = part.trim().split(';');
    const q = options.find(option => option.trim().startsWith('q='));
    const quality = q ? Number(q.trim().slice(2)) : 1;
    return [name, Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0];
  }));
  const quality = name => accepted.get(name) ?? accepted.get('*') ?? 0;
  if (quality('br') > 0 && quality('br') >= quality('gzip')) return 'br';
  return quality('gzip') > 0 ? 'gzip' : null;
}
export async function prepareBody(body, type) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const encoded = { identity: buffer };
  if (compressible(type) && buffer.length >= 128) {
    [encoded.br, encoded.gzip] = await Promise.all([
      br(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }), gz(buffer),
    ]);
  }
  return { encoded, hash: contentHash(buffer), type };
}

// Static assets are prepared at startup. Repeated dynamic responses share
// asynchronous compression, with a small bounded cache rather than event-loop blocking.
export function createResponseSender(versionedHtml) {
  const prepared = new Map();
  return async function send(req, res, status, body, type = 'text/plain; charset=utf-8', cacheControl = CACHE.error, asset = null) {
    let representation = asset;
    if (!representation) {
      const payload = type.startsWith('text/html') ? versionedHtml(body) : body;
      const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
      const key = `${type}:${contentHash(buffer)}`;
      if (!prepared.has(key)) {
        // Large exceptional responses are compressed but never retained.
        if (buffer.length > 128_000) representation = await prepareBody(buffer, type);
        else {
          if (prepared.size >= 48) prepared.delete(prepared.keys().next().value);
          const pending = prepareBody(buffer, type);
          prepared.set(key, pending);
          pending.catch(() => prepared.delete(key));
        }
      }
      representation ||= await prepared.get(key);
    }
    const encoding = chosenEncoding(req.headers['accept-encoding']);
    const use = encoding && representation.encoded[encoding] ? encoding : 'identity';
    const payload = representation.encoded[use];
    const etag = `W/"${representation.hash}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': cacheControl, ETag: etag };
    if (compressible(type)) headers.Vary = 'Accept-Encoding';
    if (cacheControl !== CACHE.error && status === 200 && String(req.headers['if-none-match'] || '').split(',').map(v => v.trim()).includes(etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    headers['Content-Length'] = payload.length;
    if (use !== 'identity') headers['Content-Encoding'] = use;
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : payload);
  };
}
