import{test}from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFile}from'node:fs/promises';import*as core from'../public/core.js';import{searchRows}from'../public/matching.js';import{transferSelected}from'../public/transfer.js';import{createRateLimiter as makeLimiter}from'../public/rate-limit.js';
class Element{
  constructor(tag='div'){this.tag=tag;this.value='';this.children=[];this.style={};this.checked=false;this.classList={toggle(){}};}
  append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}setAttribute(){}showModal(){this.opened=true;}close(){}click(){return this.onclick?.();}
  set innerHTML(value){this.value=value.replaceAll('&amp;','&');}
}
const storage=()=>{const data=new Map();return{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
async function harness({override,initialState,configured=true}={}){
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};$('playlistName').value='My transfer';$('dedup').checked=true;$('playlistUrl').value='https://open.spotify.com/playlist/0123456789ABCDEFGHIJKL';
  const requests=[],localStorage=storage(),sessionStorage=storage();if(initialState)localStorage.setItem('playlistBridge.v1',JSON.stringify(initialState));if(configured)localStorage.setItem('playlistBridge.config',JSON.stringify({google:'000000000000-example.apps.googleusercontent.com'}));
  const fetch=async(url,options={})=>{requests.push({url,options});const custom=await override?.(url,options);if(custom)return custom;if(url==='/api/config')return Response.json({googleClientId:''});if(url.startsWith('/api/spotify-playlist'))return Response.json({name:'Two new songs',rows:[{title:'Dreams',artist:'Fleetwood Mac'},{title:'Get Lucky',artist:'Daft Punk'}],warning:'Public source'});
    const u=new URL(url),path=u.pathname;if(path.endsWith('/search')){const first=u.searchParams.get('q').includes('Dreams');return Response.json({items:[{id:{videoId:first?'11111111111':'22222222222'},snippet:{title:first?'Fleetwood Mac — Dreams':'Daft Punk — Get Lucky',channelTitle:first?'Fleetwood Mac - Topic':'Daft Punk - Topic'}}]});}
    if(path.endsWith('/videos'))return Response.json({items:[{id:u.searchParams.get('id'),contentDetails:{duration:'PT4M'}}]});
    if(path.endsWith('/playlists'))return Response.json(options.method==='POST'?{id:'PL_created'}:{items:[{id:'PL_existing',snippet:{title:'Existing music'}}]});
    if(path.endsWith('/playlistItems'))return Response.json(options.method==='POST'?{id:'item_added'}:{items:[{snippet:{resourceId:{videoId:'11111111111'}}}]});
    throw Error('Unexpected request: '+url);
  };
  let authOptions;const google={accounts:{oauth2:{initTokenClient(options){authOptions=options;return{requestAccessToken(){options.callback({access_token:'test-token',expires_in:3600});}};},hasGrantedAllScopes(){return true;}}}};
  const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
  let fakeTime=Date.now();const createRateLimiter=options=>makeLimiter({...options,minInterval:0,now:()=>fakeTime,wait:async ms=>{fakeTime+=ms;}});
  const context={...core,searchRows,transferSelected,createRateLimiter,document:{getElementById:$,createElement:tag=>new Element(tag),createTextNode:text=>({text})},localStorage,sessionStorage,window:{google},google,location:{origin:'https://bridge.test',pathname:'/',search:''},history:{replaceState(){}},navigator:{},setInterval(){},setTimeout,clearTimeout,URL,URLSearchParams,fetch,console,confirm:()=>true,Blob,Response,crypto:globalThis.crypto};
  vm.runInNewContext(source,context);const settle=async()=>{for(let i=0;i<30;i++)await new Promise(setImmediate);};
  return{$,requests,localStorage,settle,authOptions:()=>authOptions};
}
test('imports arbitrary titles, automatically searches and adds only missing songs to an existing playlist',async()=>{
  const h=await harness();h.$('connectGoogle').click();await h.settle();assert.match(h.authOptions().client_id,/\.apps\.googleusercontent\.com$/);assert.equal(h.$('targetPlaylist').children.length,2);
  await h.$('importSpotify').click();const state=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.equal(state.rows.length,2);assert.ok(state.rows.every(r=>r.chosen&&r.approved));assert.equal(h.requests.filter(r=>r.url.includes('/search?')).length,2);
  h.$('targetPlaylist').value='PL_existing';h.$('targetPlaylist').onchange();await h.$('transfer').click();
  const writes=h.requests.filter(r=>r.options.method==='POST');assert.equal(writes.length,1);const body=JSON.parse(writes[0].options.body);assert.equal(body.snippet.playlistId,'PL_existing');assert.equal(body.snippet.resourceId.videoId,'22222222222');assert.ok(JSON.parse(h.localStorage.getItem('playlistBridge.v1')).rows.every(r=>r.done));
});
test('import before authentication queues every song for automatic search after connecting',async()=>{
  const h=await harness();await h.$('importSpotify').click();assert.equal(h.requests.filter(r=>r.url.includes('/search?')).length,0);assert.equal(h.$('searchAll').disabled,false);
  h.$('connectGoogle').click();await h.settle();assert.equal(h.requests.filter(r=>r.url.includes('/search?')).length,2);assert.ok(JSON.parse(h.localStorage.getItem('playlistBridge.v1')).rows.every(r=>r.chosen));
});
const savedTransfer=()=>({name:'Saved transfer',destination:'PL_saved',targetPlaylist:'new',rows:['11111111111','22222222222'].map((id,i)=>({title:'Song '+i,artist:'Artist',chosen:id,approved:true,done:false,candidates:[{id,title:'Song '+i,channel:'Artist'}]}))});
test('automatically resumes a throttled song search without restarting the playlist',async()=>{
  let throttled=false;const h=await harness({override:async url=>{if(url.includes('/search?')&&!throttled){throttled=true;return Response.json({error:{message:'Too many requests'}},{status:429,headers:{'Retry-After':'7'}});}}});
  h.$('connectGoogle').click();await h.settle();await h.$('importSpotify').click();const state=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.ok(state.rows.every(row=>row.chosen));assert.equal(h.requests.filter(r=>r.url.includes('/api/spotify-playlist')).length,1);assert.equal(h.requests.filter(r=>r.url.includes('/search?')).length,3);assert.equal(h.$('rateWait').hidden,true);
});
test('continues a throttled insertion without recreating the playlist or repeating a completed song',async()=>{
  let throttled=false;const h=await harness({override:async(url,options)=>{if(url.includes('/playlistItems?')&&options.method==='POST'&&JSON.parse(options.body).snippet.resourceId.videoId==='22222222222'&&!throttled){throttled=true;return Response.json({error:{message:'Too many requests'}},{status:429,headers:{'Retry-After':'7'}});}}});
  h.$('connectGoogle').click();await h.settle();await h.$('importSpotify').click();await h.$('transfer').click();const state=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.equal(state.transfer.status,'complete');assert.ok(state.rows.every(row=>row.done));assert.equal(h.requests.filter(r=>r.options.method==='POST'&&r.url.includes('/playlists?')).length,1);const inserts=h.requests.filter(r=>r.options.method==='POST'&&r.url.includes('/playlistItems?'));assert.equal(inserts.length,3);assert.equal(inserts.filter(r=>JSON.parse(r.options.body).snippet.resourceId.videoId==='11111111111').length,1);
});
test('does not loop on an exhausted quota and keeps an expensive search result for resuming',async()=>{
  const h=await harness({override:async url=>{if(url.includes('/videos?'))return Response.json({error:{message:'quota',errors:[{reason:'quotaExceeded'}]}},{status:429});}});
  h.$('connectGoogle').click();await h.settle();await h.$('importSpotify').click();const saved=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.equal(h.requests.filter(r=>r.url.includes('/videos?')).length,1);assert.ok(saved.rows[0].searchItems?.length);assert.match(h.$('notice').textContent,/cuota disponible/);
  const resumed=await harness({initialState:saved});resumed.$('connectGoogle').click();await resumed.settle();assert.equal(resumed.requests.filter(r=>r.url.includes('/search?')).length,1);assert.ok(JSON.parse(resumed.localStorage.getItem('playlistBridge.v1')).rows.every(row=>row.chosen));
});
test('recovers the reported saved zero-song destination without creating another playlist',async()=>{
  const h=await harness({initialState:savedTransfer(),override:async(url,options)=>{const u=new URL(url,'https://bridge.test');if(u.pathname.endsWith('/playlistItems')&&!options.method)return Response.json({error:{message:'playlist cannot be found',errors:[{reason:'playlistNotFound'}]}},{status:404});if(u.pathname.endsWith('/playlists')&&u.searchParams.get('id'))return Response.json({items:[{id:'PL_saved',contentDetails:{itemCount:0}}]});}});
  h.$('connectGoogle').click();await h.settle();await h.$('transfer').click();const state=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.equal(state.destination,'PL_saved');assert.equal(state.transfer.status,'complete');assert.ok(state.rows.every(r=>r.done));assert.equal(h.requests.filter(r=>r.options.method==='POST'&&r.url.includes('/playlists?')).length,0);assert.equal(h.requests.filter(r=>r.options.method==='POST').length,2);
});
test('shows an actionable failure beside the destination and preserves songs when the saved playlist is gone',async()=>{
  const h=await harness({initialState:savedTransfer(),override:async(url,options)=>{const u=new URL(url,'https://bridge.test');if(u.pathname.endsWith('/playlistItems')&&!options.method)return Response.json({error:{message:'playlist cannot be found',errors:[{reason:'playlistNotFound'}]}},{status:404});if(u.pathname.endsWith('/playlists')&&u.searchParams.get('id'))return Response.json({items:[]});}});
  h.$('connectGoogle').click();await h.settle();await h.$('transfer').click();const state=JSON.parse(h.localStorage.getItem('playlistBridge.v1'));assert.equal(state.transfer.status,'failed');assert.equal(state.rows.length,2);assert.ok(state.rows.every(r=>!r.done));assert.equal(h.$('changeDestination').hidden,false);assert.ok(h.$('result').children.some(e=>e.textContent?.includes('no encuentra')));assert.equal(h.requests.filter(r=>r.options.method==='POST').length,0);h.$('changeDestination').click();assert.equal(JSON.parse(h.localStorage.getItem('playlistBridge.v1')).destination,null);assert.equal(JSON.parse(h.localStorage.getItem('playlistBridge.v1')).rows.length,2);
});

test('unconfigured installations request a public client ID rather than using personal credentials',async()=>{const h=await harness({configured:false});await h.settle();h.$('connectGoogle').click();assert.equal(h.authOptions(),undefined);assert.equal(h.$('settings').opened,true);assert.equal(h.$('googleClient').value,'');});
