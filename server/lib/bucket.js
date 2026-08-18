const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

// Wraps the Railway Storage Bucket (S3-compatible — confirmed against
// Railway's own docs, Aug 2026) behind a small, boring API. Buckets are
// PRIVATE ONLY (Railway doesn't support public buckets as of this
// writing) — so nothing outside this file and server/routes/uploads.js
// ever talks to the bucket directly. Everything else in the app just
// deals with `image_url` (a relative path like
// /api/uploads/products/123-abc.jpg) that the uploads route proxies
// through to the bucket on request.
//
// Required env vars (set on the pawvy-app SERVICE, not the bucket —
// copied from the bucket's own Credentials tab in Railway):
//   BUCKET_NAME, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY,
//   BUCKET_REGION, BUCKET_ENDPOINT

let client = null;
function getClient() {
  if (client) return client;
  const { BUCKET_ENDPOINT, BUCKET_REGION, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY } = process.env;
  if (!BUCKET_ENDPOINT || !BUCKET_ACCESS_KEY_ID || !BUCKET_SECRET_ACCESS_KEY) {
    throw new Error('Bucket env vars not set (BUCKET_ENDPOINT / BUCKET_ACCESS_KEY_ID / BUCKET_SECRET_ACCESS_KEY) — see server/lib/bucket.js header comment.');
  }
  client = new S3Client({
    endpoint: BUCKET_ENDPOINT,
    region: BUCKET_REGION || 'auto',
    credentials: { accessKeyId: BUCKET_ACCESS_KEY_ID, secretAccessKey: BUCKET_SECRET_ACCESS_KEY },
    forcePathStyle: false, // Railway Buckets use virtual-hosted-style URLs by default (per Railway docs) — only flip if the bucket's Credentials tab says otherwise
    // Aug 2026 incident: default maxSockets (50) filled up entirely from a
    // stream-cleanup leak in uploads.js (now fixed — see that file's
    // comment). This raise is just headroom on top of the real fix, not a
    // substitute for it — every image on the site (banners, products,
    // Instagram) goes through this one client, so 50 was always thin for
    // real traffic even without a leak.
    requestHandler: new NodeHttpHandler({ maxSockets: 200 }),
  });
  return client;
}

function bucketName() {
  const name = process.env.BUCKET_NAME;
  if (!name) throw new Error('BUCKET_NAME env var not set.');
  return name;
}

// Uploads a buffer (already-decoded image bytes) under `key` (e.g.
// "products/123-1723200000000.jpg"). Overwrites if the key already
// exists — callers should use a fresh, unique key per upload (see
// buildImageKey below) rather than relying on overwrite behavior, so
// old images don't linger unreferenced in the bucket.
async function uploadBuffer(key, buffer, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

// Streams an object back out — used by the proxy route in
// server/routes/uploads.js. Throws if the key doesn't exist (caller
// should catch and respond 404).
async function getObjectStream(key) {
  const result = await getClient().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  return result; // .Body is a Node Readable stream; .ContentType, .ContentLength also present
}

async function objectExists(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}

// Decodes a "data:image/jpeg;base64,AAAA..." string (the format the
// upload UI already sends) into { buffer, contentType, extension }.
// Used both by the live upload endpoint and the one-time migration.
function decodeDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Not a valid base64 data URL.');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const extension = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0];
  return { buffer, contentType, extension };
}

// Builds the bucket key + the public-facing (proxied) URL together, so
// every caller derives both from one place instead of duplicating the
// path convention. `folder` is e.g. "products" or "banners"; `id` is the
// row's own id, so keys are human-traceable in the bucket ("which file
// belongs to which product") without needing a lookup.
function buildImageKey(folder, id, extension) {
  const key = `${folder}/${id}-${Date.now()}.${extension}`;
  return { key, url: `/api/uploads/${key}` };
}

module.exports = { uploadBuffer, getObjectStream, objectExists, deleteObject, decodeDataUrl, buildImageKey };
