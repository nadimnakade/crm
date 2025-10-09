const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure base uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Store all customer-medicine-detail bulk files under cmd-bulk
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const cmdDir = path.join(uploadDir, 'cmd-bulk');
    if (!fs.existsSync(cmdDir)) {
      fs.mkdirSync(cmdDir, { recursive: true });
    }
    cb(null, cmdDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `cmd-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /xls|xlsx|csv/;
  const extname = allowed.test((path.extname(file.originalname || '').toLowerCase() || ''));
  const mimetype = /spreadsheet|csv|excel/.test((file.mimetype || '').toLowerCase());
  if (extname || mimetype) return cb(null, true);
  cb(new Error('Unsupported file type'));
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter
});

module.exports = upload;