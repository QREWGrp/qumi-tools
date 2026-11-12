import tty from 'node:tty';
export async function question(label,{secret=false}={}){
 if(!process.stdin.isTTY)throw Error('Run this command in a real operator terminal; never pass tokens as arguments or through MCP');
 process.stdout.write(label+': ');
 return await new Promise((resolve,reject)=>{
  let value='';const stdin=process.stdin;
  stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');
  const onKey=(ch)=>{
   if(ch==='\u0003'){done();reject(Error('Cancelled'));return;}
   if(ch==='\r'||ch==='\n'){done();process.stdout.write('\n');resolve(value);return;}
   if(ch==='\u007f'||ch==='\b'){value=value.slice(0,-1);if(!secret)process.stdout.write('\b \b');return;}
   if(ch==='\u001b')return;
   value+=ch;if(!secret)process.stdout.write(ch);
  };
  function done(){stdin.off('data',onKey);stdin.setRawMode(false);stdin.pause();}
  stdin.on('data',onKey);
 });
}
