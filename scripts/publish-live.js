const { execFile } = require('child_process');

const scope = 'prachideshmukh23s-projects';
const alias = 'my-products-sepia.vercel.app';

function run(args) {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
    const commandArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npx.cmd', ...args]
      : args;

    execFile(command, commandArgs, { windowsHide: true, timeout: 240000 }, (error, stdout, stderr) => {
      const output = `${stdout || ''}\n${stderr || ''}`.trim();
      if (error) {
        error.output = output;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

(async () => {
  const deployOutput = await run(['vercel', '--prod', '--yes', '--scope', scope]);
  const match = deployOutput.match(/https:\/\/my-products-[^\s]+\.vercel\.app/);
  if (!match) {
    console.log(deployOutput);
    throw new Error('Could not find deployment URL in Vercel output.');
  }
  const deploymentHost = match[0].replace(/^https:\/\//, '');
  await run(['vercel', 'alias', 'set', deploymentHost, alias, '--scope', scope]);
  console.log(`Published https://${alias}`);
})().catch(error => {
  console.error(error.output || error.message || error);
  process.exit(1);
});
