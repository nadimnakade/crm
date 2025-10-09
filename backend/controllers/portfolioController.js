const path = require('path');
const xlsx = require('xlsx');
const CustomerPortfolio = require('../models/CustomerPortfolio');
const { sequelize } = require('../models');

// @desc    Upload portfolio files with metadata
// @route   POST /api/portfolio/upload
// @access  Private
exports.uploadPortfolio = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const {
      mobile = '',
      groupId = null,
      name = null,
      address = null,
      pinCode = null,
      skuName = null
    } = req.body || {};

    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const cleanMobile = (mobile || '').replace(/[^0-9]/g, '');
    const base = `/api/uploads/portfolio-${cleanMobile}`;

    const saved = [];
    for (const f of files) {
      const ext = (path.extname(f.originalname || '').toLowerCase()) || '';
      const isExcel = ['.xls', '.xlsx', '.csv'].includes(ext);
      const filePathOnDisk = path.join(__dirname, '../uploads', `portfolio-${cleanMobile}`, f.filename);

      if (isExcel) {
        try {
          const wb = xlsx.readFile(filePathOnDisk, { cellDates: true });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(ws, { defval: '' });

          // Helper to get value from possible header names (case-insensitive)
          const getVal = (row, keys) => {
            const map = {};
            Object.keys(row || {}).forEach(k => { map[k.toLowerCase()] = row[k]; });
            for (const key of keys) {
              const v = map[key.toLowerCase()];
              if (v !== undefined && v !== null && `${v}`.trim() !== '') return v;
            }
            return '';
          };

          for (const r of rows) {
            const rowMobile = `${getVal(r, ['Mobile','Phone','Phone No','Phone Number','Contact','MobileNo'])}`.replace(/[^0-9]/g, '') || cleanMobile;
            const rowName = `${getVal(r, ['Name','Customer Name','Full Name'])}` || name;
            const rowAddress = `${getVal(r, ['Address','Addr','Address1','Address Line'])}` || address;
            const rowPin = `${getVal(r, ['Pin','PinCode','Pincode'])}`.replace(/[^0-9]/g, '') || pinCode;
            const rowSku = `${getVal(r, ['SkuName','SKU Name','SKU','Medicine','Medicine Name','Medicine Details'])}` || skuName;

            const record = await CustomerPortfolio.create({
              Mobile: rowMobile,
              GroupId: groupId,
              Name: rowName,
              Address: rowAddress,
              PinCode: rowPin || null,
              SkuName: rowSku,
              FileName: f.originalname,
              FilePath: `${base}/${f.filename}`,
              UploadedBy: userId
            });
            saved.push(record);
          }
        } catch (err) {
          console.error('Excel parse failed for', f.originalname, err);
          // Fallback: save one record referencing the file
          const record = await CustomerPortfolio.create({
            Mobile: cleanMobile,
            GroupId: groupId,
            Name: name,
            Address: address,
            PinCode: pinCode,
            SkuName: skuName,
            FileName: f.originalname,
            FilePath: `${base}/${f.filename}`,
            UploadedBy: userId
          });
          saved.push(record);
        }
      } else {
        const record = await CustomerPortfolio.create({
          Mobile: cleanMobile,
          GroupId: groupId,
          Name: name,
          Address: address,
          PinCode: pinCode,
          SkuName: skuName,
          FileName: f.originalname,
          FilePath: `${base}/${f.filename}`,
          UploadedBy: userId
        });
        saved.push(record);
      }
    }

    res.status(201).json({ items: saved });
  } catch (error) {
    console.error('Portfolio upload failed:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
};

// @desc    List portfolio items
//          - unique=true: returns one record per mobile with latest file + count
//          - mobile=xxxx: returns all records for the mobile (detail view)
//          Supports pagination via page & pageSize
// @route   GET /api/portfolio
// @access  Private
exports.listPortfolio = async (req, res) => {
  try {
    const mobile = (req.query.mobile || '').replace(/[^0-9]/g, '');
    const q = (req.query.q || '').toString().trim();
    const groupId = (req.query.groupId || '').toString().trim() || null;
    const pinCode = (req.query.pinCode || '').toString().trim() || null;
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();
    const unique = ['true', '1'].includes((req.query.unique || '').toString().toLowerCase());
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const { Op } = require('sequelize');
    const baseFilters = {};
    if (groupId) baseFilters.GroupId = groupId;
    if (pinCode) baseFilters.PinCode = pinCode;
    // Date range filter
    if (from || to) {
      const range = {};
      if (from) range[Op.gte] = new Date(from);
      if (to) {
        // Include entire day for 'to'
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        range[Op.lte] = end;
      }
      baseFilters.UploadedAt = range;
    }

    // Search mode: query across mobile/name/address
    if (q) {
      const digits = q.replace(/[^0-9]/g, '');
      const orClauses = [
        { Name: { [Op.like]: `%${q}%` } },
        { Address: { [Op.like]: `%${q}%` } }
      ];
      if (digits) {
        orClauses.push({ Mobile: { [Op.like]: `%${digits}%` } });
      }
      const where = { [Op.and]: [ baseFilters, { [Op.or]: orClauses } ] };
      const total = await CustomerPortfolio.count({ where });
      const items = await CustomerPortfolio.findAll({
        where,
        order: [['UploadedAt', 'DESC']],
        offset,
        limit: pageSize
      });
      return res.json({ items, total, page, pageSize, mode: 'search' });
    }

    // Detail mode: specific mobile
    if (mobile) {
      const where = { ...baseFilters, Mobile: mobile };
      const total = await CustomerPortfolio.count({ where });
      const items = await CustomerPortfolio.findAll({
        where,
        order: [['UploadedAt', 'DESC']],
        offset,
        limit: pageSize
      });
      return res.json({ items, total, page, pageSize, mode: 'detail' });
    }

    // Unique mode (default when no mobile specified)
    if (unique || !mobile) {
      // Count distinct mobiles with filters
      const totalDistinct = await CustomerPortfolio.count({ distinct: true, col: 'Mobile', where: baseFilters });
      // Get distinct mobiles page with latest timestamp and count per mobile
      const groups = await CustomerPortfolio.findAll({
        attributes: [
          'Mobile',
          [sequelize.fn('COUNT', sequelize.col('Id')), 'count'],
          [sequelize.fn('MAX', sequelize.col('UploadedAt')), 'LatestAt']
        ],
        group: ['Mobile'],
        order: [[sequelize.literal('LatestAt'), 'DESC']],
        offset,
        limit: pageSize,
        where: baseFilters
      });

      // For each mobile, fetch the latest record to populate representative fields
      const items = await Promise.all(groups.map(async (g) => {
        const m = g.get('Mobile');
        const latest = await CustomerPortfolio.findOne({
          where: { ...baseFilters, Mobile: m },
          order: [['UploadedAt', 'DESC']]
        });
        return {
          Mobile: m,
          Count: parseInt(g.get('count'), 10) || 0,
          LatestAt: g.get('LatestAt'),
          GroupId: latest?.GroupId || null,
          Name: latest?.Name || null,
          Address: latest?.Address || null,
          PinCode: latest?.PinCode || null,
          SkuName: latest?.SkuName || null,
          FileName: latest?.FileName || null,
          FilePath: latest?.FilePath || null,
          UploadedAt: latest?.UploadedAt || g.get('LatestAt')
        };
      }));

      return res.json({ items, total: totalDistinct, page, pageSize, mode: 'unique' });
    }

    // Fallback (shouldn't reach here)
    const items = await CustomerPortfolio.findAll({ order: [['UploadedAt', 'DESC']], offset, limit: pageSize });
    return res.json({ items, total: items.length, page, pageSize, mode: 'all' });
  } catch (error) {
    console.error('Portfolio list failed:', error);
    res.status(500).json({ message: 'Failed to list items', error: error.message });
  }
};