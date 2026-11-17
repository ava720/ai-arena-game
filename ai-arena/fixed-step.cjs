'use strict';
// Only integer simulation ticks enter gameplay. Wall-clock delays never become dt.
class FixedStep {
  constructor(hz=60,maxSteps=6){
    this.stepMs=1000/hz;this.maxSteps=maxSteps;this.previous=null;
    this.accumulator=0;this.droppedMs=0;this.ticks=0;
  }
  advance(now){
    if(!Number.isFinite(now))throw new TypeError('A monotonic timestamp is required');
    if(this.previous===null){this.previous=now;return 0;}
    const elapsed=Math.max(0,now-this.previous);this.previous=Math.max(now,this.previous);
    this.accumulator+=elapsed;
    const available=Math.floor((this.accumulator+1e-7)/this.stepMs);
    const steps=Math.min(available,this.maxSteps);
    // Drop excess whole ticks on stalls; preserve the fractional interpolation remainder.
    this.accumulator=Math.max(0,this.accumulator-available*this.stepMs);
    this.droppedMs+=(available-steps)*this.stepMs;this.ticks+=steps;
    return steps;
  }
  get alpha(){return this.accumulator/this.stepMs;}
}
module.exports=FixedStep;
