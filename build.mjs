import { readFile, mkdir, writeFile } from 'node:fs/promises';
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/neis.mjs':['neis.mjs','text/javascript; charset=utf-8'],'/config.js':['config.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/regions.json':['regions.json','application/json; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/bi.png':['bi.png','image/png']};
const assets={};// 이미지(PNG)는 문자열로 읽으면 깨지므로 base64로 싣고 worker.mjs가 응답할 때 바이트로 되돌린다.
for(const [url,[file,type]] of Object.entries(files)){const binary=type==='image/png';assets[url]={type,binary,body:await readFile(new URL('public/'+file,import.meta.url),binary?'base64':'utf8')};}
const shared=(await readFile(new URL('public/neis.mjs',import.meta.url),'utf8')).replace('export async function','async function')+'\n'+(await readFile(new URL('alrimi.mjs',import.meta.url),'utf8')).replace(/^export /mg,'');
const worker=(await readFile(new URL('worker.mjs',import.meta.url),'utf8')).replace("import { fetchRows } from './public/neis.mjs';",'').replace("import { fetchAlrimi, validateAlrimi, regionCodes, alrimiErrorResponse } from './alrimi.mjs';",'');
await mkdir(new URL('dist/server/',import.meta.url),{recursive:true});
await writeFile(new URL('dist/server/index.js',import.meta.url),'const ASSETS='+JSON.stringify(assets)+';\n'+shared+'\n'+worker);
console.log('Built Worker with '+Object.keys(assets).length+' public assets. Secrets remain in runtime environment.');
