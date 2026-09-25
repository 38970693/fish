process.env.PIXI_STRESS_MS ??= '60000';
process.env.PIXI_STRESS_OUTPUT ??= 'scripts/perf-v3-06-final.json';
await import('./probe-pixi-stress.mjs');
