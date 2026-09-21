// A flight recorder for any page's audio: whatever is connected to it, it measures on the
// audio thread and writes [wall ms, audio time, peak] every quarter second. The lab's
// comparison script connects it beside the destination of the current web player, so
// both engines are measured the same way, from the audio thread.
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.every = Math.round(sampleRate / 128 / 4);
    this.blocks = 0;
    this.peak = 0;
    this.history = [];
    this.silentBlocks = 0;
    this.run = 0;
    this.longestRun = 0;
    this.port.onmessage = ({ data }) => {
      if (data === 'dump') this.port.postMessage(this.history);
      if (data === 'clear') this.history = [];
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let peak = this.peak;
      for (let i = 0; i < channel.length; i++) {
        const a = channel[i] < 0 ? -channel[i] : channel[i];
        if (a > peak) peak = a;
      }
      this.peak = peak;
      let block = 0;
      for (let i = 0; i < channel.length; i++) { const a = channel[i] < 0 ? -channel[i] : channel[i]; if (a > block) block = a; }
      if (block < 0.0005) { this.silentBlocks++; this.run++; if (this.run > this.longestRun) this.longestRun = this.run; } else this.run = 0;
    }
    if (++this.blocks % this.every === 0) {
      if (this.history.length < 4800) this.history.push([Date.now(), Math.round(currentTime * 100) / 100, Math.round(this.peak * 100) / 100, 0, this.silentBlocks, this.longestRun]);
      this.peak = 0; this.silentBlocks = 0; this.longestRun = this.run;
    }
    return true;
  }
}

registerProcessor('tap', Tap);
