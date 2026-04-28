const fs = require('fs');
const path = require('path');

function findExe(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      findExe(fullPath, results);
    } else if (item.endsWith('.exe')) {
      results.push(fullPath);
    }
  }
  return results;
}

const results = findExe('./dist-electron');
console.log('Found exe files:', results.length);
results.forEach(f => console.log(f));
