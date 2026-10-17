/* PCM remains in memory. No network or persistent storage. */
class MicrophoneCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.target = options.processorOptions.targetSamples;
    this.pcm = new Float32Array(this.target);
    this.count = 0;
    this.lastProgress = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length || !channels[0].length) return true;
    const count = Math.min(channels[0].length, this.target - this.count);
    for (let i = 0; i < count; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.pcm[this.count++] = value;
    }
    if (this.count === this.target) {
      this.port.postMessage({ type: "complete", pcm: this.pcm }, [this.pcm.buffer]);
      return false;
    }
    if (this.count - this.lastProgress >= sampleRate / 4) {
      this.lastProgress = this.count;
      this.port.postMessage({ type: "progress", samples: this.count });
    }
    return true;
  }
}
registerProcessor("microphone-capture", MicrophoneCapture);
