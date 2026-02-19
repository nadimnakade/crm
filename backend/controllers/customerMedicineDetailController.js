const path = require('path');
const xlsx = require('xlsx');
const CustomerPortfolio = require('../models/CustomerPortfolio');

// Expected headers for bulk upload (case-insensitive match)
const REQUIRED_HEADERS = [
  'Mobile Number',
  'group_id',
  'Name',
  'Address',
  'Pin code',
  'sku_name'
];

// Helper: build case-insensitive index map from header row (array of cells)
function buildHeaderIndex(headerRow) {
  const map = {};
  headerRow.forEach((h, idx) => {
    if (h !== undefined && h !== null) {
      map[String(h).trim().toLowerCase()] = idx;
    }
  });
  return map;
}

// Upload handler for Customer Medicine Detail bulk Excel/CSV
// @route POST /api/customer-medicine-details/upload
exports.uploadDetails = async (req, res) => {
  try {
    const userRole = req.user ? (req.user.role || '').toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied: Only admins can upload details' });
    }
    const userId = req.user ? req.user.id : null;
    const file = req.file || (req.files && req.files[0]);
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const base = '/api/uploads/cmd-bulk';
    const filePathOnDisk = path.join(__dirname, '../uploads', 'cmd-bulk', file.filename);

    const wb = xlsx.readFile(filePathOnDisk, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows || rows.length < 2) {
      return res.status(422).json({ message: 'No data rows found', errors: [{ row: 1, message: 'Missing header/data rows' }] });
    }
    const headerRow = rows[0];
    const idxMap = buildHeaderIndex(headerRow);

    // Validate required headers
    const missing = REQUIRED_HEADERS.filter(h => idxMap[h.toLowerCase()] === undefined);
    if (missing.length) {
      return res.status(422).json({ message: 'Invalid or missing headers', missing, required: REQUIRED_HEADERS });
    }

    let inserted = 0;
    const errors = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // Extract values by header indices
      const mobileRaw = String(row[idxMap['mobile number']] || '').trim();
      const mobile = mobileRaw.replace(/[^0-9]/g, '');
      const groupId = String(row[idxMap['group_id']] || '').trim() || null;
      const name = String(row[idxMap['name']] || '').trim() || null;
      const address = String(row[idxMap['address']] || '').trim() || null;
      const pinCodeRaw = String(row[idxMap['pin code']] || '').trim();
      const pinCode = pinCodeRaw.replace(/[^0-9]/g, '') || null;
      const skuName = String(row[idxMap['sku_name']] || '').trim() || null;

      if (!mobile || mobile.length !== 10) {
        errors.push({ row: i + 1, message: 'Invalid Mobile Number (expect 10 digits)' });
        continue;
      }

      try {
        await CustomerPortfolio.create({
          Mobile: mobile,
          GroupId: groupId,
          Name: name,
          Address: address,
          PinCode: pinCode,
          SkuName: skuName,
          FileName: file.originalname,
          FilePath: `${base}/${file.filename}`,
          UploadedBy: userId
        });
        inserted++;
      } catch (e) {
        errors.push({ row: i + 1, message: e.message || 'Insert failed' });
      }
    }

    const skipped = errors.length;
    return res.status(inserted > 0 ? 201 : 422).json({ inserted, skipped, errors });
  } catch (error) {
    console.error('CMD upload failed:', error);
    return res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// Download Excel template for Customer Medicine Detail bulk upload
// @route GET /api/customer-medicine-details/template
exports.downloadTemplate = async (req, res) => {
  try {
    const headers = [
      'Mobile Number',
      'group_id',
      'Name',
      'Address',
      'Pin code',
      'sku_name'
    ];
    const sampleRows = [
      headers,
      ['9876543210', 'G001', 'John Doe', '12 MG Road, Bengaluru', '560001', 'Dolo-650'],
      ['9123456789', 'G002', 'Jane Doe', '22 Brigade Rd, Bengaluru', '560002', 'Azithromycin 500']
    ];
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(sampleRows);
    xlsx.utils.book_append_sheet(wb, ws, 'Template');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="customer-medicine-detail.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (error) {
    console.error('Template generation failed:', error);
    return res.status(500).json({ message: 'Failed to generate template', error: error.message });
  }
};