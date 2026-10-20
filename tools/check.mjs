import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd(), dir=path.join(root,'extension');
const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
for(const file of ['background.js','manager.js','widget.js','reader.js','content.js',...['core','storage','dictionary','providers','preferences','microsoft','lookup','documents','manual'].map(x=>`lib/${x}.js`)])execFileSync(process.execPath,['--check',path.join(dir,file)]);
for(const file of [manifest.background.service_worker,manifest.options_page,'manager.css','manager.js','widget.html','widget.css','widget.js','reader.html','reader.css','vendor/pdfjs/build/pdf.mjs','vendor/pdfjs/build/pdf.worker.mjs','vendor/pdfjs/LICENSE','data/metadata.json','data/ECDICT-LICENSE.txt'])await fs.access(path.join(dir,file));
const metadata=JSON.parse(await fs.readFile(path.join(dir,'data/metadata.json'),'utf8'));
let count=0;
for(const shard of metadata.shards)count+=Object.keys(JSON.parse(await fs.readFile(path.join(dir,`data/${shard}.json`),'utf8'))).length;
if(count!==metadata.entries || count<30000)throw new Error('Dictionary count mismatch');
if(manifest.host_permissions || manifest.content_scripts?.length!==1 || manifest.content_scripts[0].all_frames!==true || manifest.content_scripts[0].matches.join(',')!=='http://*/*,https://*/*')throw new Error('Unexpected page access scope');
if(JSON.stringify(manifest.web_accessible_resources?.[0]?.resources)!=='["widget.html","assets/icon-128.png"]')throw new Error('Unexpected exposed extension files');
await fs.access(path.join(dir,'theme.css'));
for(const size of [16,32,48,128,256,512]){
  const file=`assets/icon-${size}.png`,bytes=await fs.readFile(path.join(dir,file));
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==size||bytes.readUInt32BE(20)!==size)throw new Error('Invalid icon: '+file);
  if(size<=128&&(manifest.icons?.[size]!==file||manifest.action.default_icon?.[size]!==file))throw new Error('Missing icon mapping: '+size);
}
console.log(`Syntax, manifest files and ${count} dictionary records checked.`);
