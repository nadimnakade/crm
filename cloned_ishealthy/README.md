# Cloned IsHealthy

This project is a professional, Bootstrap 5–powered clone of https://ishealthy.in/ with a new medicine availability search feature.

## Features
- Responsive, modern UI using Bootstrap 5.
- Clean navigation, hero section, services, and footer.
- Medicine availability search powered by a backend API.

## Getting Started
1. Ensure the backend server is running on `http://localhost:5000`.
2. Visit `http://localhost:5000/cloned_ishealthy/` in your browser.

## Medicine Availability API
- Endpoint: `GET /api/medicine/availability?name=<medicineName>`
- Returns: `{ "available": true | false }`

The inventory source is located at `backend/data/medicine-inventory.json`.

## Development Notes
- Static site is served by Express under `/cloned_ishealthy`.
- To modify styles, edit `assets/css/styles.css`.
- To modify interactivity, edit `assets/js/app.js`.

## Testing
- Manual: Use the search box to query medicines (e.g., Paracetamol, Ibuprofen).
- Programmatic: `fetch('/api/medicine/availability?name=Paracetamol')` should return `{ available: true }`.

## Deployment
- This folder is static; ensure your server serves it.
- If using a different server or CDN, update links accordingly.

