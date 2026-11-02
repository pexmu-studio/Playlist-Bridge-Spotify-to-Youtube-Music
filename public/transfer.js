export async function existingVideos(yt,playlistId,{fresh=false}={}){
  // A playlist just returned by playlists.insert is empty; reading its items
  // first is unnecessary and can fail before YouTube exposes the empty list.
  if(fresh)return new Set();
  const existing=new Set();let pageToken='';
  try{do{const page=await yt('playlistItems?'+new URLSearchParams({part:'snippet',playlistId,maxResults:'50',...(pageToken?{pageToken}:{})}));for(const item of page.items||[])existing.add(item.snippet?.resourceId?.videoId);pageToken=page.nextPageToken||'';}while(pageToken);return existing;}
  catch(error){
    if(error.reason!=='playlistNotFound')throw error;
    // Never interpret an arbitrary 404 as an empty list: verify the playlist
    // itself with the same Google session and require a confirmed zero count.
    const data=await yt('playlists?'+new URLSearchParams({part:'id,contentDetails',id:playlistId}));const playlist=(data.items||[]).find(p=>p.id===playlistId);
    if(playlist&&playlist.contentDetails?.itemCount===0)return existing;
    const message=playlist?'YouTube no permite leer todavía las canciones de esta playlist. Espera unos segundos y reintenta. No se ha añadido ninguna canción en este intento.':'YouTube no encuentra la playlist de destino en esta cuenta. Elige otro destino o vuelve a conectar la cuenta con la que la creaste.';
    const failure=Error(message);failure.reason=playlist?'destinationNotReady':'destinationMissing';throw failure;
  }
}
export async function transferSelected({yt,playlistId,rows,fresh=false,onProgress=()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  const existing=await existingVideos(yt,playlistId,{fresh});let added=0,alreadyPresent=0,processed=0;
  for(const row of rows){
    if(existing.has(row.chosen))alreadyPresent++;
    else{
      // A definitive 404 has not written anything. Retry that response only;
      // unknown network outcomes must be reconciled before another insertion.
      for(let attempt=0;;attempt++){
        try{const result=await yt('playlistItems?part=snippet',{method:'POST',body:JSON.stringify({snippet:{playlistId,resourceId:{kind:'youtube#video',videoId:row.chosen}}})});if(!result.id){const error=Error('YouTube no confirmó que la canción se añadiera. El progreso está guardado: reintenta para comprobar el destino antes de continuar.');error.uncertain=true;throw error;}break;}
        catch(error){if(error.reason==='playlistNotFound'&&fresh&&attempt<2){await wait(attempt===0?500:1500);continue;}if(error.reason==='playlistNotFound'){const failure=Error('YouTube no encuentra la playlist al añadir canciones. Puedes reintentar o elegir otro destino; tus canciones siguen guardadas.');failure.reason='destinationMissing';throw failure;}throw error;}
      }
      existing.add(row.chosen);added++;
    }
    row.done=true;onProgress({processed:++processed,total:rows.length,added,alreadyPresent,row});
  }
  return{processed,added,alreadyPresent};
}
