const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure base uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage config for portfolio attachments organized by mobile number
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const mobile = (req.body.mobile || 'unknown').replace(/[^0-9]/g, '');
    const portfolioDir = path.join(uploadDir, `portfolio-${mobile}`);
    if (!fs.existsSync(portfolioDir)) {
      fs.mkdirSync(portfolioDir, { recursive: true });
    }
    cb(null, portfolioDir);
  },
  filename: function (req, file, cb) {
    const fileType = req.body.fileType || 'screenshot';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${fileType}-${uniqueSuffix}${ext}`);
  }
});

// Allow images and common doc formats
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|csv|txt/;
  const extname = allowedFileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedFileTypes.test((file.mimetype || '').toLowerCase());
  if (extname || mimetype) {
    return cb(null, true);
  }
  cb(new Error('Unsupported file type'));
};

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter
});

module.exports = upload;