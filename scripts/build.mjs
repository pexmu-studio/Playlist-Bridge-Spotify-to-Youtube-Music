import{readFile,writeFile,mkdir}from'node:fs/promises';
const assets={};
for(const file of['index.html','style.css','app.js','core.js','matching.js','transfer.js','rate-limit.js']){
  assets['/'+file]={text:await readFile(new URL('../public/'+file,import.meta.url),'utf8'),type:file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'};
}
const output=new URL('../dist/',import.meta.url);await mkdir(output,{recursive:true});
await writeFile(new URL('index.js',output),'const ASSETS='+JSON.stringify(assets)+';\n'+await readFile(new URL('../worker/index.js',import.meta.url),'utf8'));
console.log('Build listo: dist/index.js');
