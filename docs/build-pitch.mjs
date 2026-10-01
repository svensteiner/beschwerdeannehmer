// Run with the bundled Node runtime. Dependencies are resolved without installing packages.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const runtime = process.env.SILVIA_ARTIFACT_RUNTIME;
const skill = process.env.SILVIA_PRESENTATIONS_SKILL;
if (!runtime || !skill) throw new Error('Set SILVIA_ARTIFACT_RUNTIME and SILVIA_PRESENTATIONS_SKILL to bundled runtime/skill directories.');
process.env.RUNTIME_NODE_MODULES = path.join(runtime, 'node/node_modules');
const { Presentation, PresentationFile } = await import(pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { resolvePresentationFont, finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const data = JSON.parse(await fs.readFile(path.join(root, 'docs/pitch-content.json'), 'utf8'));
const build = path.join(root, 'artifacts/pitch', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(build, { recursive: true });
const family = resolvePresentationFont();
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
function text(slide, value, top, height, size, color, bold=false) {
  const box = slide.shapes.add({ geometry:'textbox', position:{left:80,top,width:1120,height}, fill:'none', line:{fill:'none',width:0} });
  box.text = value;
  box.text.style = { typeface:family, fontSize:size, bold, color, autoFit:'none' };
}
for (const [i, item] of data.slides.entries()) {
  const slide = p.slides.add();
  const dark = i === 0 || i === data.slides.length - 1;
  slide.background.fill = dark ? '#1F4A3A' : '#F6F1E8';
  const ink = dark ? '#F6F1E8' : '#1F4A3A';
  text(slide, item.title, 65, i === 0 ? 250 : 160, i === 0 ? 62 : 48, ink, true);
  text(slide, item.body, i === 0 ? 355 : 255, 165, 30, ink);
  if (item.secondary) text(slide, item.secondary, 430, 145, 29, ink);
  text(slide, item.caption, 608, 80, 23, dark ? '#D7E2DA' : '#5C645E');
  slide.speakerNotes.textFrame.setText(`${item.notes}\nStand: ${data.date}. Zielgruppe: ${data.audience}`);
}
const draft = path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(p)).save(draft);
const finalPath = path.join(build,'output/Silvia-Pitch.pptx');
await fs.mkdir(path.dirname(finalPath),{recursive:true});
await finalizePresentation({workspaceDir:root,candidatePath:draft,finalPath,
  pythonExecutable:path.join(runtime,'python/python.exe'),
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
  fontPolicy:{basis:'design',families:[family]},verifyArtifactToolImport:true,
  receiptPath:path.join(build,'validation.json')});
// Render the finalized file, not only the authoring object.
const { FileBlob } = await import(pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const checked = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (let i=0;i<checked.slides.items.length;i++) {
  const png = await checked.export({slide:checked.slides.items[i],format:'png',scale:1});
  await fs.writeFile(path.join(build,`slide-${i+1}.png`),new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({finalPath,build,font:family}));
