import{normalize}from'./core.js';
export function durationSeconds(value){const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value||'');return m?(+m[1]||0)*3600+(+m[2]||0)*60+(+m[3]||0):null;}
export function matchScore(row,candidate){
  const title=normalize(candidate.title),channel=normalize(candidate.channel),all=title+' '+channel;
  const coverage=(needle,hay)=>{const words=normalize(needle).split(' ').filter(w=>w.length>1);return words.length?words.filter(w=>hay.includes(w)).length/words.length:0;};
  let score=.65*coverage(row.title,title)+.25*coverage(row.artist,all);
  if(/official audio|topic|provided to youtube/i.test(candidate.channel+' '+candidate.title))score+=.06;
  const original=normalize(row.title);for(const variant of['live','cover','remix','karaoke','sped up','slowed'])if(title.includes(variant)&&!original.includes(variant))score-=.28;
  if(row.durationMs&&candidate.duration){const delta=Math.abs(row.durationMs/1000-candidate.duration);score+=delta<5?.08:delta>35?-.25:0;}
  return Math.max(0,Math.min(1,score));
}
export async function searchTrack(row,yt){
  let items=row.searchItems||[];if(!items.length)for(const q of[`${row.artist} ${row.title}`,`${row.title} ${row.artist.split(',')[0]}`]){const data=await yt('search?'+new URLSearchParams({part:'snippet',type:'video',maxResults:'5',q}));items=(data.items||[]).filter(x=>/^[\w-]{11}$/.test(x.id?.videoId||''));if(items.length){row.searchItems=items;break;}}
  if(!items.length)return[];
  const details=await yt('videos?'+new URLSearchParams({part:'contentDetails',id:items.map(x=>x.id.videoId).join(',')}));const durations=new Map((details.items||[]).map(x=>[x.id,durationSeconds(x.contentDetails?.duration)]));
  delete row.searchItems;return items.map(x=>({id:x.id.videoId,title:x.snippet.title,channel:x.snippet.channelTitle,duration:durations.get(x.id.videoId)})).map(c=>({...c,score:matchScore(row,c)})).sort((a,b)=>b.score-a.score).slice(0,3);
}
export async function searchRows(rows,yt,onProgress=()=>{}){
  let processed=0;const pending=rows.filter(r=>!r.done&&!r.candidates?.length);for(const row of pending){onProgress(row,processed,pending.length);row.candidates=await searchTrack(row,yt);row.chosen=row.candidates[0]?.id||'';row.approved=!!row.chosen&&row.candidates[0].score>=.6;row.searchStatus=row.chosen?'found':'not-found';onProgress(row,++processed,pending.length);}
  return{found:rows.filter(r=>r.chosen).length,total:rows.length};
}
