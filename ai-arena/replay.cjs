'use strict';
const fs=require('node:fs');
const file=process.argv[2];if(!file){console.error('Usage: node replay.cjs recording.json');process.exit(1)}
const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
if(data.version!=='0.2'||!['fight','race'].includes(data.mode)||!Array.isArray(data.frames)||data.frames.length>150000)throw Error('Unsupported or oversized replay');
if(!Array.isArray(data.characters)||data.characters.length!==2)throw Error('Two character IDs required');
const engine=require(data.mode==='fight'?'./fight.js':'./race.js');const state=engine.create({characters:data.characters});
for(const inputs of data.frames){if(!Array.isArray(inputs)||inputs.length!==2)throw Error('Invalid input frame');engine.step(state,inputs)}
const result={mode:data.mode,frames:state.frame,phase:state.phase,winner:state.winner, ...(state.wins?{wins:state.wins}:{time:state.time})};
console.log(JSON.stringify(result,null,2));
if(data.result&&data.result.winner!==state.winner)throw Error('Replay result differs from recorded result');
