/** MCP URL-mode elicitation adapter; safe fallback to URL response if client lacks support. */
import crypto from 'node:crypto';
export function createQuestionElicitation(send){
 let enabled=false;
 const pending=new Map();
 return {
  initialize(params){
   const c=params?.capabilities?.elicitation || params?._meta?.['io.modelcontextprotocol/clientCapabilities']?.elicitation;
   enabled=!!c?.url;
  },
  consume(message){
   if(message?.method || message?.id===undefined)return false;
   const entry=pending.get(String(message.id));if(!entry)return false;
   pending.delete(String(message.id));clearTimeout(entry.timer);entry.resolve(message.result||{action:'cancel'});return true;
  },
  async present(result){
   if(!result?.url||result.mode!=='url')return result;
   if(!enabled)return {...result,question_format:'secure_url_fallback',note:'Client has not advertised MCP URL elicitation; open the secure question URL on the machine running the agent. Never type credentials into chat.'};
   const requestId=`qumi-elicitation-${crypto.randomUUID()}`;
   const prompt={jsonrpc:'2.0',id:requestId,method:'elicitation/create',params:{mode:'url',elicitationId:crypto.randomUUID(),url:result.url,message:result.question}};
   const answer=new Promise(resolve=>{
    const timer=setTimeout(()=>{pending.delete(requestId);resolve({action:'cancel'});},4*60*1000);timer.unref();
    pending.set(requestId,{resolve,timer});
   });
   send(prompt);
   const completed=await answer;
   return {...result,question_format:'mcp_url_elicitation',user_action:completed?.action||'cancel',note:'Secret input occurs outside MCP; query credential readiness after saving. Accepting the URL is not proof of successful provisioning.'};
  }
 };
}
