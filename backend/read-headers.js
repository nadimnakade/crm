const xlsx = require('xlsx');
const path = require('path');

const filePath = 'C:\\CRM\\crm-app\\CRM Agent Base.xlsx';

try {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const headers = [];
  const range = xlsx.utils.decode_range(worksheet['!ref']);
  const C = range.s.c;
  const R = range.s.r;

  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cell = worksheet[xlsx.utils.encode_cell({ c: C, r: R })];
    let hdr = 'UNKNOWN ' + C;
    if (cell && cell.t) hdr = xlsx.utils.format_cell(cell);
    headers.push(hdr);
  }

  console.log('Headers:', JSON.stringify(headers, null, 2));
} catch (error) {
  console.error('Error reading file:', error);
}
