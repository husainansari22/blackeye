const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const META_PATH = path.join(UPLOAD_DIR, 'current.json');
const IMAGE_PATH = path.join(UPLOAD_DIR, 'current.bin');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, 'current.bin')
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    return cb(null, true);
  }
});

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}

app.use(noStore);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT, 'public'), { maxAge: 0, etag: false }));

function readMeta() {
  if (!fs.existsSync(META_PATH) || !fs.existsSync(IMAGE_PATH)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeMeta(meta) {
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

app.get('/api/current', (_req, res) => {
  const meta = readMeta();
  if (!meta) {
    return res.json({ exists: false });
  }

  return res.json({
    exists: true,
    url: `/api/photo?v=${encodeURIComponent(meta.updatedAt)}`,
    name: meta.name,
    updatedAt: meta.updatedAt,
    size: meta.size,
    mime: meta.mime || 'image/jpeg'
  });
});

app.get('/api/photo', (req, res) => {
  const meta = readMeta();
  if (!meta || !fs.existsSync(IMAGE_PATH)) {
    return res.status(404).json({ error: 'No photo uploaded yet' });
  }

  res.set('Content-Type', meta.mime || 'image/jpeg');
  res.set('Cache-Control', 'no-store');
  return res.sendFile(IMAGE_PATH);
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  const meta = {
    name: req.file.originalname || 'photo.jpg',
    updatedAt: new Date().toISOString(),
    size: req.file.size,
    mime: req.file.mimetype || 'image/jpeg'
  };

  writeMeta(meta);
  return res.json({
    ok: true,
    exists: true,
    url: `/api/photo?v=${encodeURIComponent(meta.updatedAt)}`,
    name: meta.name,
    updatedAt: meta.updatedAt,
    size: meta.size,
    mime: meta.mime
  });
});

app.delete('/api/current', (_req, res) => {
  for (const filePath of [IMAGE_PATH, META_PATH]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // Clean any old filenames from earlier deploys
  for (const oldName of ['current.jpg', 'current.png']) {
    const oldPath = path.join(UPLOAD_DIR, oldName);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  return res.json({ ok: true, exists: false });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  const message = error && error.message ? error.message : 'Upload failed';
  res.status(400).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`KelvinOz photo feed listening on ${PORT}`);
});
