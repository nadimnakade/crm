const path = require('path');
const xlsx = require('xlsx');
const CustomerPortfolio = require('../models/CustomerPortfolio');
const { sequelize } = require('../models');

// @desc    Upload portfolio files with metadata
// @route   POST /api/portfolio/upload
// @access  Private
exports.uploadPortfolio = async (req, res) => {
  try {
    const userRole = req.user ? (req.user.role || '').toLowerCase() : '';
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({ message: 'Access denied: Only admins can upload portfolio' });
    }
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

// @desc    List portfolio items (CustomerMedicineDetails)
//          Keyset cursor pagination for consistent performance
//          - unique=true: one row per mobile (latest record fields + count)
//          - mobile=xxxx: raw records for that mobile (detail view)
//          - q search: digits>=5 -> unique-by-mobile; otherwise text search across name/address/mobile
// @route   GET /api/portfolio
// @access  Private
exports.exportPortfolio = async (req, res) => {
  try {
    // Extend request/response timeouts for long-running exports
    try { req.setTimeout(300000); } catch {}
    try { res.setTimeout(300000); } catch {}
    const mobile = (req.query.mobile || '').replace(/[^0-9]/g, '');
    const q = (req.query.q || '').toString().trim();
    const groupId = (req.query.groupId || '').toString().trim() || null;
    const pinCode = (req.query.pinCode || '').toString().trim() || null;
    const from = (req.query.from || '').toString().trim();
    const to = (req.query.to || '').toString().trim();
    const unique = ['true', '1'].includes((req.query.unique || '').toString().toLowerCase());
    const limitRaw = (req.query.limit || '').toString().trim();
    const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10) || 10000) : null;
    const topSql = limit ? 'TOP (:limit)' : '';

    const fromDate = from ? new Date(from) : null;
    let toDate = null;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      toDate = end;
    }

    const digits = q.replace(/[^0-9]/g, '');

    const runQuery = async (sql, replacements) => {
      const [rows] = await sequelize.query(sql, { replacements, raw: true });
      return rows || [];
    };

    let rows = [];
    let mode = 'unique';

    if (mobile) {
      rows = await runQuery(`
        SELECT ${topSql}
          Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
        FROM CustomerPortfolio WITH (NOLOCK)
        WHERE Mobile = :mobile
          AND (:groupId IS NULL OR GroupId = :groupId)
          AND (:pinCode IS NULL OR PinCode = :pinCode)
          AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
          AND (:toDate IS NULL OR UploadedAt <= :toDate)
        ORDER BY Id DESC
        OPTION (RECOMPILE);
      `, { mobile, groupId, pinCode, fromDate, toDate, limit });
      mode = 'detail';
    } else if (q) {
      if (digits && digits.length >= 5) {
        const whereMobileLike = `%${digits}%`;
        rows = await runQuery(`
          WITH Base AS (
            SELECT Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
            FROM CustomerPortfolio WITH (NOLOCK)
            WHERE Mobile LIKE :whereMobileLike
              AND (:groupId IS NULL OR GroupId = :groupId)
              AND (:pinCode IS NULL OR PinCode = :pinCode)
              AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
              AND (:toDate IS NULL OR UploadedAt <= :toDate)
          ), Marked AS (
            SELECT *,
                   ROW_NUMBER() OVER (PARTITION BY Mobile ORDER BY Id DESC) AS rn,
                   COUNT(1) OVER (PARTITION BY Mobile) AS [Count],
                   MAX(UploadedAt) OVER (PARTITION BY Mobile) AS LatestAt
            FROM Base
          )
          SELECT ${topSql}
            Mobile,
            [Count] AS Count,
            LatestAt,
            GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt,
            Id AS LatestId
          FROM Marked
          WHERE rn = 1
          ORDER BY Id DESC
          OPTION (RECOMPILE);
        `, { whereMobileLike, groupId, pinCode, fromDate, toDate, limit });
        mode = 'search-unique';
      } else {
        const qLike = `%${q}%`;
        const digitsLike = digits ? `%${digits}%` : null;
        rows = await runQuery(`
          SELECT ${topSql}
            Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE (
              Name LIKE :qLike OR Address LIKE :qLike
              OR (:digitsLike IS NOT NULL AND Mobile LIKE :digitsLike)
            )
            AND (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate)
          ORDER BY Id DESC
          OPTION (RECOMPILE);
        `, { qLike, digitsLike, groupId, pinCode, fromDate, toDate, limit });
        mode = 'search';
      }
    } else {
      const rowsUnique = await runQuery(`
        WITH Base AS (
          SELECT Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate)
        ), Marked AS (
          SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY Mobile ORDER BY Id DESC) AS rn,
                 COUNT(1) OVER (PARTITION BY Mobile) AS [Count],
                 MAX(UploadedAt) OVER (PARTITION BY Mobile) AS LatestAt
          FROM Base
        )
        SELECT ${topSql}
          Mobile,
          [Count] AS Count,
          LatestAt,
          GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
        FROM Marked
        WHERE rn = 1
        ORDER BY Id DESC
        OPTION (RECOMPILE);
      `, { groupId, pinCode, fromDate, toDate, limit });
      rows = rowsUnique;
      mode = 'unique';
    }

    // Prepare Excel
    let headers = [];
    let data = [];
    if (mode === 'detail' || mode === 'search') {
      headers = ['Id', 'Mobile', 'GroupId', 'Name', 'Address', 'PinCode', 'SkuName', 'FileName', 'FilePath', 'UploadedAt'];
      data = rows.map(r => ({
        Id: r.Id,
        Mobile: r.Mobile,
        GroupId: r.GroupId,
        Name: r.Name,
        Address: r.Address,
        PinCode: r.PinCode,
        SkuName: r.SkuName,
        FileName: r.FileName,
        FilePath: r.FilePath,
        UploadedAt: r.UploadedAt ? new Date(r.UploadedAt) : null
      }));
    } else {
      headers = ['Mobile', 'Count', 'Name', 'Address', 'PinCode', 'SkuName', 'FileName', 'FilePath', 'LatestAt', 'UploadedAt'];
      data = rows.map(r => ({
        Mobile: r.Mobile,
        Count: r.Count || 1,
        Name: r.Name,
        Address: r.Address,
        PinCode: r.PinCode,
        SkuName: r.SkuName,
        FileName: r.FileName,
        FilePath: r.FilePath,
        LatestAt: r.LatestAt ? new Date(r.LatestAt) : null,
        UploadedAt: r.UploadedAt ? new Date(r.UploadedAt) : null
      }));
    }

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(data, { header: headers });
    xlsx.utils.book_append_sheet(wb, ws, 'Export');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="customer-medicine-details.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);
  } catch (error) {
    console.error('Portfolio export failed:', error);
    res.status(500).json({ message: 'Failed to export items', error: error.message });
  }
};

// @desc    List portfolio items (CustomerMedicineDetails)
//          Keyset cursor pagination for consistent performance
//          - unique=true: one row per mobile (latest record fields + count)
//          - mobile=xxxx: raw records for that mobile (detail view)
//          - q search: digits>=5 -> unique-by-mobile; otherwise text search across name/address/mobile
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

    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const cursorIdRaw = req.query.cursorId;
    const cursorId = cursorIdRaw !== undefined && cursorIdRaw !== null && `${cursorIdRaw}` !== ''
      ? parseInt(cursorIdRaw, 10)
      : null;
    const fetchLimit = pageSize + 1;

    // Build common filter params
    const fromDate = from ? new Date(from) : null;
    let toDate = null;
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      toDate = end;
    }

    const digits = q.replace(/[^0-9]/g, '');

    // Helper to run raw query with parameters
    const runQuery = async (sql, replacements) => {
      const [rows] = await sequelize.query(sql, { replacements, raw: true });
      return rows || [];
    };

    // Detail mode: specific mobile
    if (mobile) {
      if (unique) {
        // Unique by Name+Mobile+Address within this mobile, latest record per group
        const rows = await runQuery(`
          WITH Base AS (
            SELECT Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
            FROM CustomerPortfolio WITH (NOLOCK)
            WHERE Mobile = :mobile
              AND (:groupId IS NULL OR GroupId = :groupId)
              AND (:pinCode IS NULL OR PinCode = :pinCode)
              AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
              AND (:toDate IS NULL OR UploadedAt <= :toDate)
          ), Agg AS (
            SELECT Mobile, Name, Address, MAX(Id) AS LatestId, MAX(UploadedAt) AS LatestAt, COUNT(1) AS [Count]
            FROM Base
            GROUP BY Mobile, Name, Address
          )
          SELECT TOP (:fetchLimit)
            a.Mobile, a.Name, a.Address, a.[Count] AS Count, a.LatestAt,
            cp.GroupId, cp.PinCode, cp.SkuName, cp.FileName, cp.FilePath, cp.UploadedAt,
            a.LatestId
          FROM Agg a
          JOIN CustomerPortfolio cp WITH (NOLOCK) ON cp.Id = a.LatestId
          WHERE (:cursorId IS NULL OR a.LatestId < :cursorId)
          ORDER BY a.LatestId DESC
          OPTION (RECOMPILE);
        `, { mobile, groupId, pinCode, fromDate, toDate, cursorId, fetchLimit });

        const hasMore = rows.length > pageSize;
        const items = hasMore ? rows.slice(0, pageSize) : rows;
        const nextCursor = hasMore ? items[items.length - 1]?.LatestId || null : null;
        let total = undefined;
        if (!cursorId) {
          const totalRows = await runQuery(`
            WITH Base AS (
              SELECT Id, Mobile, Name, Address, UploadedAt
              FROM CustomerPortfolio WITH (NOLOCK)
              WHERE Mobile = :mobile
                AND (:groupId IS NULL OR GroupId = :groupId)
                AND (:pinCode IS NULL OR PinCode = :pinCode)
                AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
                AND (:toDate IS NULL OR UploadedAt <= :toDate)
            )
            SELECT COUNT(*) AS Total
            FROM (
              SELECT Mobile, Name, Address
              FROM Base
              GROUP BY Mobile, Name, Address
            ) t;
          `, { mobile, groupId, pinCode, fromDate, toDate });
          total = Number(totalRows?.[0]?.Total || 0);
        }
        return res.json({ items, hasMore, nextCursor, total, mode: 'detail-unique' });
      } else {
        const rows = await runQuery(`
          SELECT TOP (:fetchLimit)
            Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE Mobile = :mobile
            AND (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate)
            AND (:cursorId IS NULL OR Id < :cursorId)
          ORDER BY Id DESC
          OPTION (RECOMPILE);
        `, { mobile, groupId, pinCode, fromDate, toDate, cursorId, fetchLimit });

        const hasMore = rows.length > pageSize;
        const items = hasMore ? rows.slice(0, pageSize) : rows;
        const nextCursor = hasMore ? items[items.length - 1]?.Id || null : null;
        // Total count for detail view can be expensive; only compute on first page
        let total = undefined;
        if (!cursorId) {
          const totalRows = await runQuery(`
            SELECT COUNT(1) AS Total
            FROM CustomerPortfolio WITH (NOLOCK)
            WHERE Mobile = :mobile
              AND (:groupId IS NULL OR GroupId = :groupId)
              AND (:pinCode IS NULL OR PinCode = :pinCode)
              AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
              AND (:toDate IS NULL OR UploadedAt <= :toDate);
          `, { mobile, groupId, pinCode, fromDate, toDate });
          total = Number(totalRows?.[0]?.Total || 0);
        }
        return res.json({ items, hasMore, nextCursor, total, mode: 'detail' });
      }
    }

    // Search mode
    if (q) {
      // Mobile-focused search -> unique per mobile using LatestId keyset
      if (digits && digits.length >= 5) {
        const whereMobileLike = `%${digits}%`;
        const rows = await runQuery(`
          WITH Base AS (
            SELECT Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
            FROM CustomerPortfolio WITH (NOLOCK)
            WHERE Mobile LIKE :whereMobileLike
              AND (:groupId IS NULL OR GroupId = :groupId)
              AND (:pinCode IS NULL OR PinCode = :pinCode)
              AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
              AND (:toDate IS NULL OR UploadedAt <= :toDate)
          ), Marked AS (
            SELECT *,
                 ROW_NUMBER() OVER (PARTITION BY Mobile ORDER BY Id DESC) AS rn,
                 COUNT(1) OVER (PARTITION BY Mobile) AS [Count],
                 MAX(UploadedAt) OVER (PARTITION BY Mobile) AS LatestAt
          FROM Base
        )
        SELECT TOP (:fetchLimit)
          Mobile,
          [Count] AS Count,
          LatestAt,
          GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt,
          Id AS LatestId
        FROM Marked
        WHERE rn = 1
        ORDER BY Id DESC
        OPTION (RECOMPILE);
      `, { whereMobileLike, groupId, pinCode, fromDate, toDate, cursorId, fetchLimit });

        const hasMore = rows.length > pageSize;
        const items = hasMore ? rows.slice(0, pageSize) : rows;
        const nextCursor = hasMore ? items[items.length - 1]?.LatestId || null : null;
        let total = undefined;
        if (!cursorId) {
          const totalRows = await runQuery(`
            SELECT COUNT(DISTINCT Mobile) AS Total
            FROM CustomerPortfolio WITH (NOLOCK)
            WHERE Mobile LIKE :whereMobileLike
              AND (:groupId IS NULL OR GroupId = :groupId)
              AND (:pinCode IS NULL OR PinCode = :pinCode)
              AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
              AND (:toDate IS NULL OR UploadedAt <= :toDate);
          `, { whereMobileLike, groupId, pinCode, fromDate, toDate });
          total = Number(totalRows?.[0]?.Total || 0);
        }
        return res.json({ items, hasMore, nextCursor, total, mode: 'search-unique' });
      }

      // General text search (name/address and partial mobile) -> raw rows by Id keyset
      const qLike = `%${q}%`;
      const digitsLike = digits ? `%${digits}%` : null;
      const rows = await runQuery(`
        SELECT TOP (:fetchLimit)
          Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
        FROM CustomerPortfolio WITH (NOLOCK)
        WHERE (
            Name LIKE :qLike OR Address LIKE :qLike
            OR (:digitsLike IS NOT NULL AND Mobile LIKE :digitsLike)
          )
          AND (:groupId IS NULL OR GroupId = :groupId)
          AND (:pinCode IS NULL OR PinCode = :pinCode)
          AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
          AND (:toDate IS NULL OR UploadedAt <= :toDate)
          AND (:cursorId IS NULL OR Id < :cursorId)
        ORDER BY Id DESC
        OPTION (RECOMPILE);
      `, { qLike, digitsLike, groupId, pinCode, fromDate, toDate, cursorId, fetchLimit });

      const hasMore = rows.length > pageSize;
      const items = hasMore ? rows.slice(0, pageSize) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.Id || null : null;
      // total on first page only (optional)
      let total = undefined;
      if (!cursorId) {
        const totalRows = await runQuery(`
          SELECT COUNT(1) AS Total
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE (
              Name LIKE :qLike OR Address LIKE :qLike
              OR (:digitsLike IS NOT NULL AND Mobile LIKE :digitsLike)
            )
            AND (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate);
        `, { qLike, digitsLike, groupId, pinCode, fromDate, toDate });
        total = Number(totalRows?.[0]?.Total || 0);
      }
      return res.json({ items, hasMore, nextCursor, total, mode: 'search' });
    }

    // Unique mode (default list) -> one row per mobile using LatestId keyset
    if (unique || !mobile) {
      const rows = await runQuery(`
        WITH Filtered AS (
          SELECT Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate)
        ), Agg AS (
          SELECT Mobile, MAX(Id) AS LatestId, MAX(UploadedAt) AS LatestAt, COUNT(1) AS [Count]
          FROM Filtered
          GROUP BY Mobile
        )
        SELECT TOP (:fetchLimit)
          a.Mobile,
          a.[Count] AS Count,
          a.LatestAt,
          cp.GroupId, cp.Name, cp.Address, cp.PinCode, cp.SkuName, cp.FileName, cp.FilePath, cp.UploadedAt,
          a.LatestId
        FROM Agg a
        JOIN CustomerPortfolio cp WITH (NOLOCK) ON cp.Id = a.LatestId
        WHERE (:cursorId IS NULL OR a.LatestId < :cursorId)
        ORDER BY a.LatestId DESC
        OPTION (RECOMPILE);
      `, { groupId, pinCode, fromDate, toDate, cursorId, fetchLimit });

      const hasMore = rows.length > pageSize;
      const items = hasMore ? rows.slice(0, pageSize) : rows;
      const nextCursor = hasMore ? items[items.length - 1]?.LatestId || null : null;
      // total distinct on first page only
      let total = undefined;
      if (!cursorId) {
        const totalRows = await runQuery(`
          SELECT COUNT(DISTINCT Mobile) AS Total
          FROM CustomerPortfolio WITH (NOLOCK)
          WHERE (:groupId IS NULL OR GroupId = :groupId)
            AND (:pinCode IS NULL OR PinCode = :pinCode)
            AND (:fromDate IS NULL OR UploadedAt >= :fromDate)
            AND (:toDate IS NULL OR UploadedAt <= :toDate);
        `, { groupId, pinCode, fromDate, toDate });
        total = Number(totalRows?.[0]?.Total || 0);
      }
      return res.json({ items, hasMore, nextCursor, total, mode: 'unique' });
    }

    // Fallback (shouldn't reach here)
    const rows = await runQuery(`
      SELECT TOP (:fetchLimit)
        Id, Mobile, GroupId, Name, Address, PinCode, SkuName, FileName, FilePath, UploadedAt
      FROM CustomerPortfolio WITH (NOLOCK)
      WHERE (:cursorId IS NULL OR Id < :cursorId)
      ORDER BY Id DESC
      OPTION (RECOMPILE);
    `, { cursorId, fetchLimit });
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? items[items.length - 1]?.Id || null : null;
    return res.json({ items, hasMore, nextCursor, total: undefined, mode: 'all' });
  } catch (error) {
    console.error('Portfolio list failed:', error);
    res.status(500).json({ message: 'Failed to list items', error: error.message });
  }
};
