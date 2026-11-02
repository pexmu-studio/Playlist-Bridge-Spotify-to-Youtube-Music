import http from'node:http';import{existsSync}from'node:fs';import{fileURLToPath}from'node:url';
if(existsSync(new URL('.env',import.meta.url)))process.loadEnvFile(fileURLToPath(new URL('.env',import.meta.url)));
const{default:worker}=await import('./dist/index.js');
const port=Number(process.env.PORT||8787);if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT no es válido.');
const env={GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID||''};
http.createServer(async(req,res)=>{
  try{const response=await worker.fetch(new Request(new URL(req.url,'http://localhost:'+port),{method:req.method}),env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(500,{'Content-Type':'application/json'}).end(JSON.stringify({error:'No se pudo completar la solicitud.'}));}
}).listen(port,'127.0.0.1',()=>console.log('Playlist Bridge: http://localhost:'+port));
