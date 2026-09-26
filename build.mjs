import { readFile, mkdir, writeFile } from 'node:fs/promises';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/neis.mjs':['neis.mjs','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
const assets={};for(const [url,[file,type]] of Object.entries(files))assets[url]={type,body:await readFile(new URL('public/'+file,import.meta.url),'utf8')};
const shared=(await readFile(new URL('public/neis.mjs',import.meta.url),'utf8')).replace('export async function','async function');
const worker=(await readFile(new URL('worker.mjs',import.meta.url),'utf8')).replace("import { fetchRows } from './public/neis.mjs';",'');
await mkdir(new URL('dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/server/index.js',import.meta.url),'const ASSETS='+JSON.stringify(assets)+';\n'+shared+'\n'+worker);
console.log('Built Worker with five public assets. Secrets remain in runtime environment.');
