export function retryDelay(value,{now=Date.now(),fallback=60000}={}){
  if(value!=null&&String(value).trim()!==''){const seconds=Number(value);if(Number.isFinite(seconds))return seconds>=0?Math.ceil(seconds*1000):fallback;const date=Date.parse(value);if(Number.isFinite(date))return Math.max(0,date-now);}
  return fallback;
}
function sleep(ms,signal){return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);const error=Error('Espera detenida. El progreso está guardado; puedes reintentar más tarde.');error.cancelled=true;reject(error);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
export function createRateLimiter({now=Date.now,wait=sleep,minInterval=1000,maxRetries=3,initialUntil=0,onCooldown=()=>{},onWait=()=>{},onResume=()=>{}}={}){
  let until=Number(initialUntil)||0,nextRequest=0,tail=Promise.resolve(),controller=null;
  async function pause(target,kind,attempt){const remaining=target-now();if(remaining<=0)return;controller=new AbortController();if(kind==='cooldown')onWait({until:target,attempt,maxRetries});try{await wait(remaining,controller.signal);}finally{controller=null;if(kind==='cooldown')onResume();}}
  function run(task){const promise=tail.then(async()=>{
    for(let attempt=0;;attempt++){
      await pause(until,'cooldown',attempt);await pause(nextRequest,'pace',attempt);nextRequest=now()+minInterval;
      try{const result=await task();if(until){until=0;onCooldown(0);}return result;}
      catch(error){if(!error.rateLimited||error.uncertain||error.quotaExceeded)throw error;
        const fallback=60000*2**attempt,delay=retryDelay(error.retryAfter,{now:now(),fallback});until=Math.max(until,now()+Math.max(1000,delay));onCooldown(until);
        if(attempt>=maxRetries){error.message='YouTube sigue limitando las peticiones después de varios intentos. El progreso está guardado. Reintenta más tarde; la app respetará la espera del servicio.';throw error;}
      }
    }
  });tail=promise.catch(()=>{});return promise;}
  return{run,cancel(){if(controller)controller.abort();},get until(){return until;}};
}
