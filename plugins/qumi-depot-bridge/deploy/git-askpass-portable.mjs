/** Return a token to the approved Git process only; never log to MCP or an agent. */
if(process.env.QUMI_GIT_ASKPASS_ACTIVE!=='1'||!process.env.DEPOT_GIT_KEY){process.exit(1);}
const prompt=process.argv.slice(2).join(' ').toLowerCase();
if(prompt.includes('username'))process.stdout.write('x-access-token\n');
else if(prompt.includes('password')||prompt.includes('token'))process.stdout.write(`${process.env.DEPOT_GIT_KEY}\n`);
else process.exit(1);
