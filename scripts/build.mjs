import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
for (const file of ['index.html','admin.html','guide.html','app.js','admin.js','guide.js','styles.css']) {
  await copyFile(file,`dist/${file}`);
}
