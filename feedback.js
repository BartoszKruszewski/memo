let audioContext = null;

function canUseAudio() {
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

function ensureAudioContext() {
  if (!canUseAudio()) {
    return null;
  }

  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtx();
  }

  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }

  return audioContext;
}

function playTone({
  frequency,
  duration = 0.12,
  type = 'sine',
  volume = 0.08,
  start = 0,
  endFrequency = null
}) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const startTime = context.currentTime + start;
  const endTime = startTime + duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 40), endTime);
  }

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.03);
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

export function initFeedback() {
  const unlock = () => {
    ensureAudioContext();
  };

  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
}

export function playRevealFeedback() {
  ensureAudioContext();
  playTone({ frequency: 520, duration: 0.05, volume: 0.035 });
  playTone({ frequency: 760, duration: 0.07, volume: 0.03, start: 0.03 });
  vibrate(6);
}

export function playGoodFeedback() {
  ensureAudioContext();
  playTone({ frequency: 523.25, duration: 0.11, volume: 0.07 });
  playTone({ frequency: 659.25, duration: 0.13, volume: 0.075, start: 0.08 });
  playTone({ frequency: 783.99, duration: 0.18, volume: 0.065, start: 0.17 });
  vibrate([12, 35, 10]);
}

export function playBadFeedback() {
  ensureAudioContext();
  playTone({ frequency: 196, duration: 0.09, type: 'square', volume: 0.042 });
  playTone({ frequency: 164.81, duration: 0.11, type: 'square', volume: 0.048, start: 0.1 });
  playTone({ frequency: 138.59, duration: 0.14, type: 'triangle', volume: 0.04, start: 0.2 });
  vibrate([30, 45, 35, 45, 30]);
}

export function playCompleteFeedback() {
  ensureAudioContext();
  playTone({ frequency: 523.25, duration: 0.1, volume: 0.06 });
  playTone({ frequency: 659.25, duration: 0.1, volume: 0.065, start: 0.07 });
  playTone({ frequency: 783.99, duration: 0.12, volume: 0.07, start: 0.14 });
  playTone({ frequency: 1046.5, duration: 0.22, volume: 0.055, start: 0.22 });
  vibrate([14, 40, 14, 40, 18]);
}

export function playTapFeedback() {
  ensureAudioContext();
  playTone({ frequency: 420, duration: 0.04, volume: 0.025 });
  vibrate(5);
}
