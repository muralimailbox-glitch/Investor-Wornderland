#!/usr/bin/env bash
# test-r2.sh - Round-trip: PUT → GET → DELETE on S3-compatible storage.
# Works against Cloudflare R2 (default) and local MinIO (when R2_ENDPOINT is set).
set -uo pipefail

if [ -f .env.local ]; then set -a && . ./.env.local && set +a; fi
if [ -f .env ]; then set -a && . ./.env && set +a; fi

: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY required}"
: "${R2_BUCKET:?R2_BUCKET required}"

if [ -n "${R2_ENDPOINT:-}" ]; then
  ENDPOINT="$R2_ENDPOINT"
else
  : "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID required when R2_ENDPOINT is not set}"
  ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
fi

FORCE_PATH_STYLE="${R2_FORCE_PATH_STYLE:-false}"
KEY="gate-test/$(date +%s)-$RANDOM.txt"

cat <<JS | node
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
(async () => {
  const r2 = new S3Client({
    region: 'auto',
    endpoint: '$ENDPOINT',
    forcePathStyle: $FORCE_PATH_STYLE === 'true' ? true : ($FORCE_PATH_STYLE === true),
    credentials: {
      accessKeyId: '$R2_ACCESS_KEY_ID',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const Key = '$KEY';
  const body = 'OotaOS R2 round-trip test ' + new Date().toISOString();
  try {
    await r2.send(new PutObjectCommand({ Bucket: '$R2_BUCKET', Key, Body: body, ContentType: 'text/plain' }));
    console.log('PUT OK');
    const got = await r2.send(new GetObjectCommand({ Bucket: '$R2_BUCKET', Key }));
    const text = await got.Body.transformToString();
    if (text !== body) { console.error('GET mismatch'); process.exit(1); }
    console.log('GET OK');
    await r2.send(new DeleteObjectCommand({ Bucket: '$R2_BUCKET', Key }));
    console.log('DELETE OK');
    console.log('Object storage round-trip succeeded (endpoint: $ENDPOINT)');
  } catch (e) {
    console.error('Object storage FAILED:', e.message);
    process.exit(1);
  }
})();
JS
