import { vi } from 'vitest';

export interface FakeAudioParam {
  value: number;
  defaultValue: number;
  cancelScheduledValues: (time: number) => void;
  setTargetAtTime: (value: number, startTime: number, timeConstant: number) => void;
}

export interface FakeAudioNode {
  type: string;
  inputs: FakeAudioNode[];
  outputs: FakeAudioNode[];
  gain?: FakeAudioParam;
  frequency?: FakeAudioParam;
  Q?: FakeAudioParam;
  threshold?: FakeAudioParam;
  knee?: FakeAudioParam;
  ratio?: FakeAudioParam;
  attack?: FakeAudioParam;
  release?: FakeAudioParam;
  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    output?: number,
    input?: number,
  ): FakeAudioNode | FakeAudioDestination;
  disconnect(): void;
}

export interface FakeAudioDestination {
  type: 'destination';
}

export interface FakeMediaElementSource extends FakeAudioNode {
  type: 'MediaElementAudioSourceNode';
  element: HTMLAudioElement;
}

export class FakeAudioContext {
  state: AudioContextState;
  readonly currentTime = 0;
  readonly destination: FakeAudioDestination = { type: 'destination' };
  readonly nodes: FakeAudioNode[] = [];
  readonly close = viClose;
  private elementSources = new Map<HTMLAudioElement, FakeMediaElementSource>();
  private readonly resumeToRunning: boolean;

  constructor(state: AudioContextState = 'running', resumeToRunning = true) {
    this.state = state;
    this.resumeToRunning = resumeToRunning;
  }

  resume = async (): Promise<void> => {
    if (this.resumeToRunning) {
      this.state = 'running';
    }
  };

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.nodes.push(node);
    return node;
  }

  createChannelSplitter(channels: number): FakeChannelSplitterNode {
    const node = new FakeChannelSplitterNode(channels);
    this.nodes.push(node);
    return node;
  }

  createChannelMerger(channels: number): FakeChannelMergerNode {
    const node = new FakeChannelMergerNode(channels);
    this.nodes.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.nodes.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    const node = new FakeDynamicsCompressorNode();
    this.nodes.push(node);
    return node;
  }

  createAnalyser(): FakeAnalyserNode {
    const node = new FakeAnalyserNode();
    this.nodes.push(node);
    return node;
  }

  createMediaElementSource(element: HTMLAudioElement): FakeMediaElementSource {
    const existing = this.elementSources.get(element);
    if (existing) {
      return existing;
    }
    const node: FakeMediaElementSource = {
      type: 'MediaElementAudioSourceNode',
      element,
      inputs: [],
      outputs: [],
      connect(dest, _output?, _input?) {
        this.outputs.push(dest as FakeAudioNode);
        (dest as FakeAudioNode).inputs.push(this);
        return dest;
      },
      disconnect() {
        this.outputs = [];
      },
    };
    this.elementSources.set(element, node);
    this.nodes.push(node);
    return node;
  }
}

function createParam(defaultValue = 0): FakeAudioParam {
  return {
    value: defaultValue,
    defaultValue,
    cancelScheduledValues: () => undefined,
    setTargetAtTime(value: number) {
      this.value = value;
    },
  };
}

class FakeGainNode implements FakeAudioNode {
  type = 'GainNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  gain = createParam(1);

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

class FakeChannelSplitterNode implements FakeAudioNode {
  type = 'ChannelSplitterNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  constructor(readonly channels: number) {}

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

class FakeChannelMergerNode implements FakeAudioNode {
  type = 'ChannelMergerNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  constructor(readonly channels: number) {}

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

class FakeBiquadFilterNode implements FakeAudioNode {
  type = 'BiquadFilterNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  filterType = 'peaking';
  frequency = createParam(350);
  gain = createParam(0);
  Q = createParam(1);

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

class FakeDynamicsCompressorNode implements FakeAudioNode {
  type = 'DynamicsCompressorNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  threshold = createParam(-24);
  knee = createParam(30);
  ratio = createParam(12);
  attack = createParam(0.003);
  release = createParam(0.25);

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

class FakeAnalyserNode implements FakeAudioNode {
  type = 'AnalyserNode';
  inputs: FakeAudioNode[] = [];
  outputs: FakeAudioNode[] = [];
  fftSize = 256;
  smoothingTimeConstant = 0.8;
  readonly frequencyBinCount = 128;
  private readonly frequencyData = new Uint8Array(128);

  getByteFrequencyData(array: Uint8Array): void {
    for (let i = 0; i < array.length; i += 1) {
      array[i] = this.frequencyData[i % this.frequencyData.length];
    }
  }

  connect(
    destination: FakeAudioNode | FakeAudioDestination,
    _output?: number,
    _input?: number,
  ): FakeAudioNode | FakeAudioDestination {
    this.outputs.push(destination as FakeAudioNode);
    if ('inputs' in destination) {
      destination.inputs.push(this);
    }
    return destination;
  }

  disconnect(): void {
    this.outputs = [];
    this.inputs = [];
  }
}

const viClose = async () => undefined;

export function createFakeAudioElement(): HTMLAudioElement {
  return {
    src: '',
    volume: 1,
    currentTime: 42,
    paused: false,
    readyState: 4,
    play: vi.fn(async () => undefined),
    pause: vi.fn(() => undefined),
    load: vi.fn(() => undefined),
    addEventListener: vi.fn(() => undefined),
    removeEventListener: vi.fn(() => undefined),
  } as unknown as HTMLAudioElement;
}
