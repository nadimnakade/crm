const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream');

const imagesDir = path.join(__dirname, 'cloned_ishealthy', 'images');
const indexHtmlPath = path.join(__dirname, 'cloned_ishealthy', 'index.html');

if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Read index.html
let html = fs.readFileSync(indexHtmlPath, 'utf8');

// Regex to find proxied images: /cloned_ishealthy_live/images/FILENAME
const imageRegex = /\/cloned_ishealthy_live\/images\/([^"'\s]+)/g;

const matches = [...html.matchAll(imageRegex)];
const uniqueImages = [...new Set(matches.map(m => m[1]))];

console.log(`Found ${uniqueImages.length} images to download.`);

// Function to download an image
const downloadImage = (filename) => {
  const url = `https://ishealthy.in/images/${filename}`;
  const dest = path.join(imagesDir, filename);

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(dest);
        pipeline(res, fileStream, (err) => {
          if (err) {
            console.error(`Failed to write ${filename}: ${err.message}`);
            reject(err);
          } else {
            console.log(`Downloaded: ${filename}`);
            resolve();
          }
        });
      } else {
        console.error(`Failed to download ${filename}: Status ${res.statusCode}`);
        // resolve anyway to continue
        resolve();
      }
    }).on('error', (err) => {
      console.error(`Error downloading ${filename}: ${err.message}`);
      resolve();
    });
  });
};

// Download all images sequentially
(async () => {
  for (const img of uniqueImages) {
    await downloadImage(img);
  }

  // Update index.html to point to local images/
  // Replace "/cloned_ishealthy_live/images/..." with "images/..."
  // Also handle double prefix if any: "/cloned_ishealthy_live/cloned_ishealthy_live/images/..."
  // My previous script might have introduced double prefix.
  
  let newHtml = html;
  
  // Fix double prefix if present
  newHtml = newHtml.replace(/\/cloned_ishealthy_live\/cloned_ishealthy_live\/images\//g, 'images/');
  
  // Fix single prefix
  newHtml = newHtml.replace(/\/cloned_ishealthy_live\/images\//g, 'images/');

  fs.writeFileSync(indexHtmlPath, newHtml, 'utf8');
  console.log('Updated index.html with local image paths.');
})();
