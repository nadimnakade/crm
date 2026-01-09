document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('availabilityForm');
  const input = document.getElementById('medicineName');
  const result = document.getElementById('availabilityResult');

  const show = (html) => { result.innerHTML = html; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = (input.value || '').trim();
    if (!name) {
      show('<div class="alert alert-warning" role="alert">Please enter a medicine name.</div>');
      return;
    }
    show('<div class="alert alert-info" role="alert">Checking availability…</div>');
    try {
      const resp = await fetch(`/api/medicine/availability?name=${encodeURIComponent(name)}`);
      if (!resp.ok) throw new Error(`Request failed: ${resp.status}`);
      const data = await resp.json();
      const badge = data.available
        ? '<span class="badge bg-success">Available</span>'
        : '<span class="badge bg-danger">Not Available</span>';
      show(`<div class="alert alert-light border" role="alert">${name}: ${badge}</div>`);
    } catch (err) {
      show(`<div class="alert alert-danger" role="alert">Error: ${err.message}</div>`);
    }
  });
});

