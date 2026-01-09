const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'backend', 'temp_index.html');
const destPath = path.join(__dirname, 'cloned_ishealthy', 'index.html');

let content = fs.readFileSync(sourcePath, 'utf8');

// Helper to replace links
// 1. Handle relative paths like images/..., css/...
content = content.replace(/(src|href)="images\//g, '$1="/cloned_ishealthy_live/images/');
content = content.replace(/(src|href)="css\//g, '$1="/cloned_ishealthy_live/css/');
content = content.replace(/(src|href)="js\//g, '$1="/cloned_ishealthy_live/js/');

// 2. Handle root-relative paths like /about, /medicines, but avoid // (protocol relative)
// We look for src="/..." or href="/..." where the next char is not /
content = content.replace(/(src|href)="\/(?!\/)/g, '$1="/cloned_ishealthy_live/');

// 3. Special case: Fix the home link which might be just "/cloned_ishealthy_live/" now, which is fine.
// But we might have double replacements if not careful.
// The regex in step 2 handles href="/" -> href="/cloned_ishealthy_live/"
// and href="/about" -> href="/cloned_ishealthy_live/about"

// 4. Fix any potential double slashes if the original had them? No, regex is specific.

// 5. Update the title or add a comment to indicate it's the cloned version
content = content.replace('<title>', '<!-- Local Clone -->\n  <title>');

fs.writeFileSync(destPath, content, 'utf8');
console.log('Successfully cloned index.html with updated paths.');
