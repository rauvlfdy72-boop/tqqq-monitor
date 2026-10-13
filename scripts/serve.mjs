import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const full=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));if(full!==root&&!full.startsWith(root+'/')){res.writeHead(403);res.end();return;}const body=await readFile(full);res.writeHead(200,{'Content-Type':types[extname(full)]??'application/octet-stream','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(4181,'127.0.0.1',()=>console.log('http://127.0.0.1:4181/'));
