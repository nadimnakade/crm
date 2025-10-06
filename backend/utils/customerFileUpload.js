const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure base uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage config for customer attachments
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const customerId = req.params.id;
    const customerDir = path.join(uploadDir, `customer-${customerId}`);
    if (!fs.existsSync(customerDir)) {
      fs.mkdirSync(customerDir, { recursive: true });
    }
    cb(null, customerDir);
  },
  filename: function (req, file, cb) {
    const fileType = req.body.fileType || 'document';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${fileType}-${uniqueSuffix}${ext}`);
  }
});

// Allow common document/image types including CSV
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter
});

module.exports = upload;