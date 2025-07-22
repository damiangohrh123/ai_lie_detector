class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs, outputs, parameters) {
    if (inputs[0] && inputs[0][0]) {
      this.port.postMessage(inputs[0][0]);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor); 