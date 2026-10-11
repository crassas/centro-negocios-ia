// Bound voice waits without retrying an already executed request.
export function withVoiceDeadline(work, milliseconds, message='Voice stage timed out.') {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{const error=new Error(message);error.name='TimeoutError';reject(error);},milliseconds);
    Promise.resolve(work).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
