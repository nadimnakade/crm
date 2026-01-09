const path = require('path');
const fs = require('fs');

// Load inventory from JSON file lazily
let inventory = null;
function loadInventory() {
  if (inventory) return inventory;
  const filePath = path.join(__dirname, '../data/medicine-inventory.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    inventory = JSON.parse(raw);
  } catch (e) {
    inventory = [];
    console.warn('Medicine inventory not found or invalid, using empty list');
  }
  return inventory;
}

// @desc    Return availability status for a medicine name
// @route   GET /api/medicine/availability?name=Paracetamol
// @access  Public or Protected (CORS enforced globally)
exports.getAvailability = async (req, res) => {
  try {
    const queryName = (req.query.name || '').toString().trim();
    if (!queryName) {
      return res.status(400).json({ available: false, message: 'Missing medicine name' });
    }

    const inv = loadInventory();
    const match = inv.find((m) => {
      const n = (m.name || '').toString().trim().toLowerCase();
      return n === queryName.toLowerCase();
    });

    const available = !!(match && match.available === true);
    return res.json({ available });
  } catch (error) {
    console.error('Medicine availability error:', error);
    return res.status(500).json({ available: false, message: error.message || 'Server error' });
  }
};

// @desc    Search medicines by name (substring) and optional category
// @route   GET /api/medicine/search?q=para&category=Analgesic&limit=20
// @access  Public
exports.searchMedicines = async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    const category = (req.query.category || '').toString().trim().toLowerCase();
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 20, 100));

    const inv = loadInventory();
    let results = inv
      .filter((m) => {
        const name = (m.name || '').toString().trim().toLowerCase();
        const cat = (m.category || '').toString().trim().toLowerCase();
        const matchesText = q ? name.includes(q) : true;
        const matchesCat = category ? cat === category : true;
        return matchesText && matchesCat;
      })
      .map((m) => {
        const name = (m.name || '').toString();
        // Simple relevance: startsWith > includes
        const relevance = q ? (name.toLowerCase().startsWith(q) ? 2 : 1) : 0;
        return { name: m.name, category: m.category || '', available: !!m.available, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name))
      .slice(0, limit);

    return res.json({ count: results.length, items: results });
  } catch (error) {
    console.error('Medicine search error:', error);
    return res.status(500).json({ count: 0, items: [], message: error.message || 'Server error' });
  }
};

