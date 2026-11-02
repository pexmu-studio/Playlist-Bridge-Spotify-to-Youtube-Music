import{playlistId,videoId,deduplicate}from'./core.js';
import{searchRows}from'./matching.js';
import{transferSelected}from'./transfer.js';
import{createRateLimiter}from'./rate-limit.js';
const DEFAULT_GOOGLE_CLIENT='';
const $=id=>document.getElementById(id),key='playlistBridge.v1';let config=read('playlistBridge.config',{}),state=read(key,{rows:[],name:'Mi playlist de Spotify',destination:null}),googleAccess=null,busy=false,googleClient=null,googleTimer=null;config.google ||= DEFAULT_GOOGLE_CLIENT;

let rateWait=null;
const cooldownKey='playlistBridge.youtubeCooldown';
const requestLimiter=createRateLimiter({initialUntil:read(cooldownKey,0),onCooldown:until=>{try{if(until)localStorage.setItem(cooldownKey,JSON.stringify(until));else localStorage.removeItem(cooldownKey);}catch{}},onWait:info=>{rateWait=info;save();updateWait();},onResume:()=>{rateWait=null;updateWait();notice('Reanudando desde el punto donde se detuvo…');}});
function updateWait(){const box=$('rateWait');box.hidden=!rateWait;if(!rateWait)return;const seconds=Math.max(0,Math.ceil((rateWait.until-Date.now())/1000));$('retryText').textContent='YouTube limita temporalmente las peticiones. Continuaremos automáticamente en '+seconds+' s. Reintento '+Math.max(1,rateWait.attempt)+' de '+rateWait.maxRetries+'.';}
$('stopWaiting').onclick=()=>requestLimiter.cancel();

function read(k,f){try{return JSON.parse(localStorage.getItem(k))||f;}catch{return f;}}
function save(){state.name=$('playlistName').value;try{localStorage.setItem(key,JSON.stringify(state));}catch{notice('El navegador no permite guardar el progreso. Mantén esta página abierta hasta terminar.',true);}}
function notice(message,error=false){$('notice').hidden=false;$('notice').classList.toggle('error',error);$('notice').textContent=message;}
function decode(s){const el=document.createElement('textarea');el.innerHTML=s;return el.value;}
function el(tag,text,cls){const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;}
function connected(){return !!googleAccess&&googleAccess.expires>Date.now();}
function update(){
const n=state.rows.length,pending=state.rows.filter(row=>row.approved&&row.chosen&&!row.done),missing=state.rows.some(row=>!row.done&&!row.candidates?.length);
$('reviewTitle').textContent=n?state.name:'Canciones';$('reviewPanel').hidden=!n;$('trackBadge').textContent=n+' canciones';$('destinationPanel').hidden=!n;
$('searchAll').hidden=!n||!missing||!connected();$('searchAll').disabled=busy||!n;$('searchAll').textContent='Buscar pendientes';
$('transfer').disabled=busy||!pending.length;$('transfer').textContent=!connected()?'Conectar para guardar':state.destination?'Continuar transferencia':state.targetPlaylist&&state.targetPlaylist!=='new'?'Añadir '+pending.length+' canciones':'Crear playlist';
$('googleState').textContent=connected()?'Google conectado':'';$('connectGoogle').textContent=connected()?'Cambiar cuenta':'Conectar Google';
for(const id of['connectGoogle','importSpotify','reset','settingsButton','approveAll','changeDestination'])$(id).disabled=busy;
$('playlistUrl').disabled=busy;$('playlistName').disabled=busy||!!state.destination;$('approveAll').checked=!!n&&state.rows.filter(row=>row.chosen&&!row.done).length>0&&state.rows.filter(row=>row.chosen&&!row.done).every(row=>row.approved);
$('targetPlaylist').disabled=busy||!connected()||!!state.destination;$('refreshPlaylists').disabled=busy||!connected();$('newPlaylistName').hidden=!!state.targetPlaylist&&state.targetPlaylist!=='new';
$('changeDestination').hidden=!state.destination;$('sourceNotice').hidden=!state.sourceWarning;$('sourceNotice').textContent=state.sourceWarning?'Comprueba que el número de canciones coincida con Spotify: su reproductor puede mostrar solo parte de la lista.':'';showResult();
}

function showResult(){
const r=$('result');r.replaceChildren();r.hidden=!state.destination&&!state.transfer?.error;if(r.hidden)return;
const done=state.rows.filter(row=>row.done).length,pending=state.rows.filter(row=>row.approved&&row.chosen&&!row.done).length,transfer=state.transfer;
const failed=transfer?.status==='failed',complete=transfer?.status==='complete';r.classList.toggle('failed',failed);r.classList.toggle('pending',!failed&&!complete);
let text=complete?done+' canciones confirmadas en el destino.':busy&&transfer?.status==='running'?'Transferencia en curso: '+done+' canciones confirmadas.':done?done+' canciones confirmadas; '+pending+' pendientes.':'Todavía no hay canciones confirmadas en el destino.';
r.append(el('div',text));if(transfer?.error){r.append(el('p',transfer.error,'transfer-error'));r.append(el('p','Conservamos tus canciones y el progreso. Pulsa Continuar transferencia para reintentar, o elige otro destino.','hint'));}else if(!complete&&!busy)r.append(el('p','El destino está seleccionado, pero la transferencia no ha terminado. Pulsa Continuar transferencia.','hint'));
if(state.destination)for(const[title,host]of[['Abrir en YouTube Music ↗','music.youtube.com']]){const a=el('a',title);a.href='https://'+host+'/playlist?list='+encodeURIComponent(state.destination);a.target='_blank';a.rel='noopener noreferrer';r.append(a);}
}

function render(){const list=$('trackList');list.replaceChildren();state.rows.forEach((row,i)=>{const line=el('div',null,'track');const art=el('span',null,'number');if(/^[\w-]{11}$/.test(row.chosen||'')){const img=el('img');img.src='https://i.ytimg.com/vi/'+row.chosen+'/default.jpg';img.alt='';img.loading='lazy';art.append(img);}else art.append(el('span','♪','track-note'));art.append(el('span',String(i+1).padStart(2,'0'),'track-index'));line.append(art);const source=el('div');source.append(el('strong',row.title),el('small',row.artist));line.append(source);const match=el('div');if(row.candidates?.length){const select=el('select');select.setAttribute('aria-label',`Versión de ${row.title}`);select.disabled=busy||row.done;const none=el('option','Elige una versión');none.value='';select.append(none);for(const c of row.candidates){const option=el('option',c.title+' · '+c.channel);option.value=c.id;select.append(option);}select.value=row.chosen||'';select.onchange=()=>{row.chosen=select.value;row.approved=!!row.chosen;save();render();};match.append(select);if(row.chosen){const confidence=row.candidates.find(c=>c.id===row.chosen)?.score;if(confidence!=null&&confidence<.6)match.append(el('small','Revisa esta coincidencia','match-warning'));}}else match.append(el('small',row.searchStatus==='not-found'?'Sin coincidencias. Puedes buscar manualmente.':'Se buscará al conectar Google'));const search=el('a','Buscar otra versión ↗');search.href='https://music.youtube.com/search?q='+encodeURIComponent(row.artist+' '+row.title);search.target='_blank';search.rel='noopener noreferrer';search.className='track-search';if(row.chosen){const music=el('a','YouTube Music ↗');music.href='https://music.youtube.com/watch?v='+row.chosen;music.target='_blank';music.rel='noopener noreferrer';music.className='track-music';match.append(music);}
if(!row.done){const manual=el('input');manual.className='manual';manual.placeholder='O pega el enlace de la versión correcta';manual.setAttribute('aria-label',`Enlace manual de ${row.title}`);manual.disabled=busy;manual.onchange=()=>{const id=videoId(manual.value.trim());if(!id)return notice('Introduce un enlace válido de YouTube.',true);row.candidates=[...(row.candidates||[]).filter(c=>c.id!==id),{id,title:'Versión elegida manualmente',channel:'YouTube'}];row.chosen=id;row.approved=true;save();render();};const options=el('details',null,'manual-options');options.append(el('summary','Cambiar versión'),search,manual);match.append(options);}line.append(match);if(row.done)line.append(el('span','✓ Añadida','done'));else{const label=el('label',null,'check');const check=el('input');check.type='checkbox';check.checked=!!row.approved;check.disabled=busy||!row.chosen;check.onchange=()=>{row.approved=check.checked;save();update();};label.append(check,document.createTextNode('Incluir'));line.append(label);}list.append(line);});update();}
async function run(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){if(state.transfer?.status==='running'){state.transfer.status='failed';state.transfer.error=e.message||'No se pudo completar la transferencia.';}notice(e.message||'No se pudo completar la operación.',true);}finally{busy=false;save();render();}}
async function api(url,token,options={}){
let response;try{response=await fetch(url,{...options,headers:{Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});}catch{const error=Error('No se pudo confirmar la respuesta del servicio. Conservamos el progreso; comprueba tu conexión antes de reanudar.');error.uncertain=true;throw error;}
let data={};try{data=await response.json();}catch{if(response.ok){const error=Error('El servicio devolvió una respuesta incompleta. Comprueba tu biblioteca antes de reintentar.');error.uncertain=true;throw error;}}
if(response.ok)return data;
const reason=data.error?.errors?.[0]?.reason||data.error?.details?.find(detail=>detail.reason)?.reason;
const error=Error(String(data.error?.message||'El servicio respondió con un error ('+response.status+').').replace(/<[^>]+>/g,''));error.status=response.status;error.reason=reason;
if(response.status===401){googleAccess=null;error.message='La sesión de Google ha caducado. Vuelve a conectar y continúa desde el progreso guardado.';throw error;}
if(['quotaExceeded','dailyLimitExceeded','dailyLimitExceededUnreg','QUOTA_EXCEEDED'].includes(reason)){error.quotaExceeded=true;error.message='Google ha agotado la cuota disponible. Una espera de 60 segundos no garantiza que se restablezca. El progreso está guardado: reanuda cuando vuelva a haber cuota.';throw error;}
if(response.status===429||(response.status===403&&['rateLimitExceeded','userRateLimitExceeded','RATE_LIMIT_EXCEEDED'].includes(reason))){error.rateLimited=true;error.retryAfter=response.headers.get('Retry-After');error.message='YouTube limita temporalmente las peticiones. El progreso está guardado.';throw error;}
if(reason==='accessNotConfigured'||reason==='serviceDisabled')error.message='Habilita YouTube Data API v3 en el proyecto de Google de tu Client ID y vuelve a intentarlo.';
if(reason==='playlistNotFound')error.message='YouTube no encuentra la playlist de destino. Puedes reintentar o elegir otra playlist.';
throw error;
}
const yt=(path,options)=>requestLimiter.run(()=>{if(!connected())throw Error('Vuelve a conectar Google para continuar desde el progreso guardado.');return api('https://www.googleapis.com/youtube/v3/'+path,googleAccess.token,options);});

async function loadPublicConfig(){if(config.google)return;try{const response=await fetch('/api/config');if(!response.ok)return;const data=await response.json();if(/^[\w.-]+\.apps\.googleusercontent\.com$/.test(data.googleClientId||''))config.google=data.googleClientId;}catch{}}
function settings(){$('googleClient').value=config.google||'';$('googleOrigin').textContent=location.origin;$('settings').showModal();}
$('settingsButton').onclick=settings;
$('saveSettings').onclick=()=>{const id=$('googleClient').value.trim();if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id))return notice('Comprueba el Google Client ID.',true);if(config.google!==id)googleAccess=null;config={google:id};try{localStorage.setItem('playlistBridge.config',JSON.stringify(config));}catch{return notice('Activa el almacenamiento del navegador para guardar la configuración.',true);}$('settings').close();update();notice('Configuración guardada.');};
function connectGoogle(){
if(!config.google)return settings();if(!window.google?.accounts?.oauth2)return notice('No se ha cargado el acceso de Google. Comprueba tu conexión o el bloqueador de contenido y recarga.',true);
googleClient=google.accounts.oauth2.initTokenClient({client_id:config.google,scope:'https://www.googleapis.com/auth/youtube.force-ssl',callback:r=>{
clearTimeout(googleTimer);if(r.error)return notice('Google no ha concedido acceso: '+r.error,true);if(!google.accounts.oauth2.hasGrantedAllScopes(r,'https://www.googleapis.com/auth/youtube.force-ssl'))return notice('Concede el permiso de YouTube para buscar y guardar la playlist.',true);
googleAccess={token:r.access_token,expires:Date.now()+Number(r.expires_in)*1000-30000};notice('Google conectado. Preparando tus playlists…');update();
run(async()=>{await loadTargets();if(state.rows.some(row=>!row.done&&!row.candidates?.length))await automaticSearch();else notice('Google conectado. Pega una playlist pública: sus canciones se buscarán automáticamente.');});
},error_callback:()=>{clearTimeout(googleTimer);notice('La ventana de Google se cerró o no pudo abrirse. Si estás en el navegador integrado, abre esta app en Chrome o Edge y pulsa Conectar.',true);}});notice('Completa el acceso en la ventana de Google. Si no aparece, abre esta app en Chrome o Edge.');clearTimeout(googleTimer);googleTimer=setTimeout(()=>{if(!connected())notice('Google aún no ha confirmado el acceso. Si no ves su ventana, abre esta app en Chrome o Edge y vuelve a conectar.',true);},20000);googleClient.requestAccessToken({prompt:'select_account'});
}
$('connectGoogle').onclick=connectGoogle;
async function loadTargets(){
const select=$('targetPlaylist');select.replaceChildren();const fresh=el('option','Crear una playlist nueva (privada)');fresh.value='new';select.append(fresh);
try{let pageToken='';do{const data=await yt('playlists?'+new URLSearchParams({part:'snippet',mine:'true',maxResults:'50',...(pageToken?{pageToken}:{})}));for(const p of data.items||[]){const option=el('option',decode(p.snippet.title));option.value=p.id;select.append(option);}pageToken=data.nextPageToken||'';}while(pageToken);select.value=state.targetPlaylist||'new';if(!select.value){select.value='new';state.targetPlaylist='new';}}
catch(e){notice('No pudimos cargar tus playlists: '+e.message,true);if(e.rateLimited||e.quotaExceeded||e.cancelled)throw e;}update();
}
$('refreshPlaylists').onclick=()=>run(loadTargets);$('targetPlaylist').onchange=()=>{state.targetPlaylist=$('targetPlaylist').value;save();update();};
async function automaticSearch(){
if(!connected()){notice(state.rows.length+' canciones importadas. Pulsa Conectar Google: se buscarán todas automáticamente al iniciar sesión.');return;}
const result=await searchRows(state.rows,yt,(row,done,total)=>{notice('Buscando en YouTube '+Math.min(done+1,total)+' de '+total+': '+row.artist+' — '+row.title);save();render();});
state.autoSearchPending=false;save();render();notice(result.found+' de '+result.total+' canciones con versión propuesta. Las coincidencias claras están incluidas; puedes cambiar la versión o excluir canciones antes de guardar.');
}
async function afterImport(){state.autoSearchPending=true;save();await automaticSearch();}

function replaceRows(rows,name){if(state.destination&& !confirm('La playlist ya creada seguirá en YouTube. ¿Quieres iniciar una nueva transferencia?'))return false;if(!rows.length)throw Error('No se han encontrado canciones.');const clean=deduplicate(rows);state={rows:clean.map(r=>({...r,candidates:[],chosen:'',approved:false,done:false})),name:name||'Mi playlist de Spotify',destination:null,targetPlaylist:'new'};$('targetPlaylist').value='new';$('playlistName').value=state.name;notice(`${clean.length} canciones importadas${rows.length>clean.length?`; ${rows.length-clean.length} repetidas omitidas`:''}. Conecta YouTube y busca sus versiones.`);save();render();return true;}
$('importSpotify').onclick=()=>run(async()=>{
const id=playlistId($('playlistUrl').value);if(!id)throw Error('Pega un enlace completo de una playlist pública de Spotify.');
let response;try{response=await fetch('/api/spotify-playlist?id='+encodeURIComponent(id));}catch{throw Error('No se pudo consultar la lista pública. Comprueba tu conexión.');}
const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo leer la playlist pública.');if(!replaceRows(data.rows,data.name))return;state.sourceWarning=data.warning;save();render();await afterImport();
});

$('searchAll').onclick=()=>{if(!connected())return connectGoogle();return run(automaticSearch);};
$('approveAll').onchange=()=>{for(const row of state.rows)if(row.chosen&&!row.done)row.approved=$('approveAll').checked;save();render();};$('playlistName').oninput=()=>{save();update();};
$('changeDestination').onclick=()=>{
if(!confirm('¿Elegir otra playlist de destino? Conservaremos las canciones seleccionadas. Las canciones ya guardadas seguirán en la playlist anterior.'))return;
state.destination=null;state.targetPlaylist='new';state.creating=false;state.transfer=null;for(const row of state.rows)row.done=false;$('targetPlaylist').value='new';$('progressWrap').hidden=true;save();render();notice('Elige otra playlist o crea una nueva. Conservamos las canciones y sus versiones.');
};
$('transfer').onclick=()=>{if(!connected())return connectGoogle();return run(async()=>{
if((!state.targetPlaylist||state.targetPlaylist==='new')&&!state.name.trim())throw Error('Escribe un nombre para tu playlist.');
const selected=state.rows.filter(row=>row.approved&&row.chosen&&!row.done);if(!selected.length)throw Error('Incluye al menos una canción pendiente.');
state.transfer={status:'running',phase:'prepare',requested:selected.length,error:null};let fresh=false;save();
if(state.creating&&!state.destination)throw Error('YouTube no confirmó si llegó a crear la playlist. Comprueba tu biblioteca y selecciona el destino existente antes de crear otra.');
if(!state.destination&&state.targetPlaylist&&state.targetPlaylist!=='new'){state.destination=state.targetPlaylist;save();}
if(!state.destination){
state.transfer.phase='create';state.creating=true;save();let data;
try{data=await yt('playlists?part=snippet,status',{method:'POST',body:JSON.stringify({snippet:{title:state.name.trim(),description:'Canciones seleccionadas con Playlist Bridge.'},status:{privacyStatus:'private'}})});}catch(e){if(!e.uncertain){state.creating=false;save();}throw e;}
if(!data.id)throw Error('YouTube no confirmó el identificador de la playlist. Comprueba tu biblioteca antes de crear otra.');state.destination=data.id;state.creating=false;fresh=true;save();
}
state.transfer.phase='check';$('progressWrap').hidden=false;$('progress').max=selected.length;$('progress').value=0;$('progressLabel').textContent='Comprobando el destino…';save();render();
const result=await transferSelected({yt,playlistId:state.destination,rows:selected,fresh,onProgress:progress=>{
state.transfer.phase='add';state.transfer.processed=progress.processed;$('progress').value=progress.processed;$('progressLabel').textContent=progress.processed+' de '+progress.total+' canciones confirmadas';save();render();
}});
state.transfer={status:'complete',phase:'complete',...result,error:null};save();render();notice('Transferencia completada: '+result.added+' canciones añadidas y '+result.alreadyPresent+' que ya estaban en el destino.');
});};

$('reset').onclick=()=>{if(!confirm('¿Borrar configuración, sesiones y progreso de este navegador? Las playlists de YouTube se conservan.'))return;if(googleAccess&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(googleAccess.token,()=>{});['playlistBridge.config',key].forEach(k=>localStorage.removeItem(k));['playlistBridge.spotify','playlistBridge.pkce'].forEach(k=>sessionStorage.removeItem(k));googleAccess=null;config={google:DEFAULT_GOOGLE_CLIENT};$('targetPlaylist').value='new';state={rows:[],name:'Mi playlist de Spotify',destination:null};$('playlistName').value=state.name;$('playlistUrl').value='';$('progressWrap').hidden=true;render();notice('Datos locales borrados y sesiones desconectadas.');};
$('playlistName').value=state.name;render();void loadPublicConfig();setInterval(update,30000);setInterval(updateWait,1000);
