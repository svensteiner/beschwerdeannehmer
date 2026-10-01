// Targeted edit of the existing deck, preserving slide objects and formatting.
// Run only after the presentation skill's operation marker and source inspection.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const runtime = process.env.SILVIA_ARTIFACT_RUNTIME;
const skill = process.env.SILVIA_PRESENTATIONS_SKILL;
if (!runtime || !skill) throw new Error('Bundled runtime and presentation skill paths required.');
process.env.RUNTIME_NODE_MODULES = path.join(runtime, 'node/node_modules');
const { FileBlob, PresentationFile } = await import(pathToFileURL(path.join(runtime, 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs')).href);
const { finalizePresentation } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')).href);
const source = path.join(root, 'docs/Silvia-Pitch.pptx');
const data = JSON.parse(await fs.readFile(path.join(root, 'docs/pitch-content.json'), 'utf8'));
const build = path.join(root, 'artifacts/pitch', new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(path.join(build, 'output'), { recursive: true });
const p = await PresentationFile.importPptx(await FileBlob.load(source));
if (p.slides.items.length !== data.slides.length) throw new Error('Slide count mismatch');
const snap = await p.inspect({ kind: 'slide,textbox,layout', maxChars: 100000 });
await fs.writeFile(path.join(build, 'before.ndjson'), snap.ndjson);
const records = snap.ndjson.split('\n').filter(Boolean).map(line => JSON.parse(line));
// Existing native text boxes are identified by their verified template positions.
const positions = { title: 65, body: null, secondary: 430, caption: 608 };
for (const [index, content] of data.slides.entries()) {
  const slide = p.slides.items[index];
  for (const [field, top] of Object.entries(positions)) {
    if (!content[field]) continue;
    const y = field === 'body' ? (index === 0 ? 355 : 255) : top;
    const matches = records.filter(r => r.kind === 'textbox' && r.slide === index + 1 && Math.abs(r.bbox?.[1] - y) < 1);
    if (matches.length !== 1) throw new Error(`Ambiguous template anchor ${index + 1}/${field}`);
    const anchor = matches[0];
    if (anchor.text !== content[field]) p.resolve(anchor.id).text.replace(anchor.text, content[field]);
  }
  slide.speakerNotes.textFrame.setText(`${content.notes}\nStand: ${data.date}. Zielgruppe: ${data.audience}`);
}
const candidatePath = path.join(build, 'candidate.pptx');
const finalPath = path.join(build, 'output/Silvia-Pitch.pptx');
await (await PresentationFile.exportPptx(p)).save(candidatePath);
await finalizePresentation({ workspaceDir: root, candidatePath, finalPath,
  explicitTotalSlideCount: data.slides.length,
  pythonExecutable: path.join(runtime, 'python/python.exe'),
  integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
  fontPolicy: { basis: 'reference', families: ['Arial'], referencePath: source,
    referenceSha256: createHash('sha256').update(await fs.readFile(source)).digest('hex') },
  verifyArtifactToolImport: true, receiptPath: path.join(build, 'validation.json') });
const checked = await PresentationFile.importPptx(await FileBlob.load(finalPath));
for (const [i, slide] of checked.slides.items.entries()) {
  const png = await checked.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(build, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
const after = await checked.inspect({ kind: 'slide,textbox,notes,layout', maxChars: 100000 });
await fs.writeFile(path.join(build, 'after.ndjson'), after.ndjson);
console.log(JSON.stringify({ build, finalPath }));
