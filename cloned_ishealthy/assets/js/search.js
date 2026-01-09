document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('availabilityForm');
  const input = document.getElementById('medicineName');
  const result = document.getElementById('availabilityResult');
  const suggestions = document.getElementById('quickSuggestions');
  const categorySel = document.getElementById('category');
  const list = document.getElementById('resultsList');
  const empty = document.getElementById('resultsEmpty');

  const show = (html) => { result.innerHTML = html; };

  suggestions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-suggest]');
    if (!btn) return;
    input.value = btn.getAttribute('data-suggest');
    form.dispatchEvent(new Event('submit'));
  });

  async function performSearch() {
    const q = (input.value || '').trim();
    const category = (categorySel.value || '').trim();
    if (!q && !category) {
      list.hidden = true;
      empty.hidden = true;
      show('');
      return;
    }
    show('<div class="alert alert-info" role="alert">Searching…</div>');
    try {
      const params = new URLSearchParams({ q });
      if (category) params.set('category', category);
      const resp = await fetch(`/api/medicine/search?${params.toString()}`);
      if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
      const data = await resp.json();
      list.innerHTML = '';
      if (data.items && data.items.length) {
        data.items.forEach((item) => {
          const status = item.available ? 'Available' : 'Not Available';
          const badge = item.available ? 'bg-success' : 'bg-danger';
          const li = document.createElement('li');
          li.className = 'list-group-item';
          li.innerHTML = `
            <div>
              <div class="name">${item.name}</div>
              <div class="category">${item.category || ''}</div>
            </div>
            <span class="badge ${badge}">${status}</span>
          `;
          list.appendChild(li);
        });
        list.hidden = false;
        empty.hidden = true;
        show('');
      } else {
        list.hidden = true;
        empty.hidden = false;
        show('');
      }
    } catch (err) {
      list.hidden = true;
      empty.hidden = true;
      show(`<div class="alert alert-danger" role="alert">Error: ${err.message}</div>`);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    performSearch();
  });

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 300);
  });
  categorySel.addEventListener('change', performSearch);
});
