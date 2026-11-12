import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuestionElicitation} from '../server/elicitation.mjs';

test('secure URL mode is emitted only when client advertises URL elicitation',async()=>{
 let out=[];
 const adapter=createQuestionElicitation(request=>out.push(request));
 const question={mode:'url',question:'Provide token privately?',url:'http://127.0.0.1:12345/'};
 let v=await adapter.present(question);
 assert.equal(v.question_format,'secure_url_fallback');assert.equal(out.length,0);
 adapter.initialize({capabilities:{elicitation:{form:{},url:{}}}});
 const pending=adapter.present(question);
 assert.equal(out.length,1);
 assert.equal(out[0].method,'elicitation/create');
 assert.equal(out[0].params.mode,'url');
 assert.equal(out[0].params.url,question.url);
 assert(adapter.consume({jsonrpc:'2.0',id:out[0].id,result:{action:'accept'}}));
 v=await pending;
 assert.equal(v.question_format,'mcp_url_elicitation');assert.equal(v.user_action,'accept');
});
