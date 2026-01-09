// Lightweight dev server for cloned_ishealthy preview without DB dependency
const express = require('express');
const cors = require('cors');
const path = require('path');
const https = require('https');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// API: medicine availability
app.use('/api/medicine', require('./routes/medicineRoutes'));

// Static: cloned_ishealthy site
app.use('/cloned_ishealthy', express.static(path.join(__dirname, '../cloned_ishealthy')));

// Live proxy of ishealthy.in for exact visual clone
app.use('/cloned_ishealthy_live', (req, res) => {
  const upstream = 'https://ishealthy.in';
  const urlPath = req.originalUrl.replace(/^\/cloned_ishealthy_live/, '') || '/';
  const targetUrl = new URL(urlPath, upstream);

  const client = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = client.request(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      host: new URL(upstream).host
    }
  }, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.entries(proxyRes.headers).forEach(([k, v]) => res.setHeader(k, v));
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).send('Bad Gateway');
  });

  if (req.readable) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Dev static server running on port ${PORT}`);
  console.log(`Preview: http://localhost:${PORT}/cloned_ishealthy/`);
  console.log(`Live clone: http://localhost:${PORT}/cloned_ishealthy_live/`);
});
