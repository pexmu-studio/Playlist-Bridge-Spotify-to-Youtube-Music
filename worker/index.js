// This service reads only Spotify's publicly accessible embed page. It never
// requests account cookies, access tokens, audio files or private Spotify APIs.
export function parseEmbed(html){
  const match=html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
  if(!match)throw Error('Spotify no ha publicado los datos de esta lista en su reproductor. Inténtalo con otra playlist pública.');
  let entity;try{entity=JSON.parse(match[1]).props?.pageProps?.state?.data?.entity;}catch{throw Error('No se han podido leer los datos públicos de Spotify.');}
  if(entity?.type!=='playlist'||!Array.isArray(entity.trackList))throw Error('Esta playlist no está disponible en el reproductor público. Comprueba que sea pública.');
  const rows=entity.trackList.filter(t=>t.entityType==='track'&&/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri||'')&&t.title&&t.subtitle).map(t=>({title:String(t.title),artist:String(t.subtitle).replace(/\u00a0/g,' '),spotifyUri:t.uri,durationMs:Number(t.duration)||null}));
  if(!rows.length)throw Error('El reproductor público no muestra canciones de esta lista. Puede estar vacía, ser privada o tener restricciones.');
  return{name:String(entity.name||entity.title||'Playlist de Spotify'),rows,source:'public-embed',possiblyPartial:true,warning:rows.length>=100?'Se han leído 100 o más canciones. Spotify puede recortar el reproductor público: compara este total con la playlist original antes de transferir.':'Canciones leídas del reproductor público. Compara el total con Spotify: este método no garantiza que incluya toda la playlist.'};
}
export async function handlePlaylist(request,fetcher=(...args)=>globalThis.fetch(...args)){
  const url=new URL(request.url),id=url.searchParams.get('id');
  const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  if(request.method!=='GET')return json({error:'Método no permitido.'},405);
  if(!/^[A-Za-z0-9]{22}$/.test(id||''))return json({error:'El identificador de la playlist no es válido.'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const upstream=await fetcher(`https://open.spotify.com/embed/playlist/${id}`,{headers:{Accept:'text/html'},redirect:'manual',signal:controller.signal});
    if(!upstream.ok)return json({error:upstream.status===429?'Spotify limita temporalmente las consultas. Inténtalo más tarde.':'Spotify no permite leer esta playlist pública ahora. Inténtalo más tarde.'},upstream.status===429?429:502);
    const reader=upstream.body.getReader();let size=0,text='',decoder=new TextDecoder();try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4000000){await reader.cancel();return json({error:'La página de Spotify supera el tamaño que podemos procesar.'},502);}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
    return json(parseEmbed(text));
  }catch(e){console.error('Spotify public import:',e.name,e.message);return json({error:e.name==='TimeoutError'||e.name==='AbortError'?'Spotify ha tardado demasiado en responder. Inténtalo de nuevo.':e.message?.startsWith('Spotify')||e.message?.startsWith('Esta playlist')||e.message?.startsWith('El reproductor')||e.message?.startsWith('No se han')?e.message:'No se pudo consultar el reproductor público de Spotify. Inténtalo más tarde.'},502);}finally{clearTimeout(timer);}
}
export default{async fetch(request,env={}){const pathname=new URL(request.url).pathname;if(pathname==='/api/config'){if(request.method!=='GET')return new Response('Método no permitido',{status:405});const value=String(env.GOOGLE_CLIENT_ID||'');return Response.json({googleClientId:/^[\w.-]+\.apps\.googleusercontent\.com$/.test(value)?value:''},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}if(pathname==='/api/spotify-playlist')return handlePlaylist(request);const asset=ASSETS[pathname==='/'?'/index.html':pathname];if(!asset)return new Response('No encontrado',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});return new Response(request.method==='HEAD'?null:asset.text,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'}});}};
