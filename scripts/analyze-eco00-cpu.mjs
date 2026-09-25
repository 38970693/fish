/** Summarise Chrome Profiler self samples; diagnostic, not wall-frame accounting. */
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/analyze-eco00-cpu.mjs <profile.json>');
const profile = JSON.parse(await readFile(path, 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
const parents = new Map();
for (const node of profile.nodes) {
  for (const childId of node.children ?? []) parents.set(childId, node.id);
}
const totals = new Map();
const queryCallers = new Map();
const renderPhases = new Map();
const phaseNames = new Set(['drawTerrain', 'syncCreatures', 'syncLabels', 'drawDynamicWorld', 'drawAnimated', 'updateFlexibleBody']);
for (let index = 0; index < profile.samples.length; index += 1) {
  const sampleId = profile.samples[index];
  const frame = nodes.get(sampleId);
  if (!frame) continue;
  let cursor = sampleId;
  while (cursor !== undefined && nodes.get(cursor)?.functionName !== 'queryCircle') cursor = parents.get(cursor);
  if (cursor !== undefined) {
    const caller = nodes.get(parents.get(cursor))?.functionName || '(unknown caller)';
    queryCallers.set(caller, (queryCallers.get(caller) ?? 0) + (profile.timeDeltas[index] ?? 0));
  }
  cursor = sampleId;
  const seenPhases = new Set();
  while (cursor !== undefined) {
    const name = nodes.get(cursor)?.functionName;
    if (phaseNames.has(name)) seenPhases.add(name);
    cursor = parents.get(cursor);
  }
  for (const name of seenPhases) renderPhases.set(name, (renderPhases.get(name) ?? 0) + (profile.timeDeltas[index] ?? 0));
  const key = `${frame.functionName || '(anonymous)'} @ ${frame.url || '(native)'}:${frame.lineNumber + 1}`;
  totals.set(key, (totals.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
}
const sampledMs = [...totals.values()].reduce((sum, value) => sum + value, 0) / 1000;
console.log(`Samples: ${profile.samples.length}; sampled time: ${sampledMs.toFixed(1)}ms`);
console.table([...totals].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .map(([location, microseconds]) => ({ location, ms: +(microseconds / 1000).toFixed(1),
    share: `${(microseconds / 1000 / sampledMs * 100).toFixed(1)}%` })));
console.log('Inclusive queryCircle samples by immediate caller (overlapping with the table above):');
console.table([...queryCallers].sort((a, b) => b[1] - a[1])
  .map(([caller, microseconds]) => ({ caller, ms: +(microseconds / 1000).toFixed(1),
    share: `${(microseconds / 1000 / sampledMs * 100).toFixed(1)}%` })));
console.log('Inclusive Pixi render-phase samples (nested; do not add to self-time table):');
console.table([...renderPhases].sort((a, b) => b[1] - a[1])
  .map(([phase, microseconds]) => ({ phase, ms: +(microseconds / 1000).toFixed(1),
    share: `${(microseconds / 1000 / sampledMs * 100).toFixed(1)}%` })));
