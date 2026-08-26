const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const META_PATH = path.join(UPLOAD_DIR, 'current.json');
const IMAGE_PATH = path.join(UPLOAD_DIR, 'current.jpg');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, 'current.jpg')
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads are allowed'));
    }
    return cb(null, true);
  }
});

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: 0, etag: false, lastModified: true }));
app.use(express.static(path.join(ROOT, 'public'), { maxAge: 0 }));

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
    url: `/uploads/current.jpg?v=${encodeURIComponent(meta.updatedAt)}`,
    name: meta.name,
    updatedAt: meta.updatedAt,
    size: meta.size
  });
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded' });
  }

  const meta = {
    name: req.file.originalname || 'photo.jpg',
    updatedAt: new Date().toISOString(),
    size: req.file.size
  };

  writeMeta(meta);
  return res.json({
    ok: true,
    exists: true,
    url: `/uploads/current.jpg?v=${encodeURIComponent(meta.updatedAt)}`,
    name: meta.name,
    updatedAt: meta.updatedAt,
    size: meta.size
  });
});

app.delete('/api/current', (_req, res) => {
  for (const filePath of [IMAGE_PATH, META_PATH]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
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
