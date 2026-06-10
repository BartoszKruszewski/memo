let audioContext = null;
let silentAudio = null;
let feedbackReady = false;

const FEEDBACK_READY_KEY = 'memoFeedbackReady';
const SILENT_AUDIO_SRC = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQAYACAAZG1EYQAAAAAAAP//AAC4AAABAAEA';

function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function canUseAudio() {
  return Boolean(window.AudioContext || window.webkitAudioContext);
}

function setPlaybackAudioSession() {
  if (navigator.audioSession?.type !== undefined) {
    navigator.audioSession.type = 'playback';
  }
}

function primeAudioContext(context) {
  if (!context || context.__primed) {
    return;
  }

  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  context.__primed = true;
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

  primeAudioContext(audioContext);
  return audioContext;
}

function primeSilentAudioSync() {
  if (!silentAudio) {
    return;
  }

  silentAudio.muted = false;
  silentAudio.volume = 1;
  silentAudio.currentTime = 0;

  const playPromise = silentAudio.play();
  if (playPromise) {
    void playPromise.catch(() => {});
  }
}

async function primeSilentAudio() {
  if (!silentAudio) {
    return;
  }

  primeSilentAudioSync();

  try {
    await silentAudio.play();
    silentAudio.pause();
    silentAudio.currentTime = 0;
  } catch {
    // Ignore unlock failures here; Web Audio may still work after resume.
  }
}

function getVolumeScale() {
  return isIOS() ? 2.75 : 1;
}

function playTone({
  frequency,
  duration = 0.12,
  type = 'sine',
  volume = 0.08,
  start = 0,
  endFrequency = null,
  force = false
}) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  if (!force && context.state === 'suspended') {
    return;
  }

  const scaledVolume = Math.min(volume * getVolumeScale(), 0.35);
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
  gain.gain.exponentialRampToValueAtTime(scaledVolume, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(endTime + 0.03);
}

function triggerIOSHaptic(pulses = 1) {
  if (!isIOS()) {
    return;
  }

  for (let index = 0; index < pulses; index += 1) {
    try {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;left:-9999px;display:none;';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');

      label.appendChild(input);
      document.body.appendChild(label);
      label.click();
      document.body.removeChild(label);
    } catch {
      // Ignore haptic failures on unsupported Safari versions.
    }
  }
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
    return;
  }

  if (!isIOS()) {
    return;
  }

  const pulses = Array.isArray(pattern) ? Math.min(3, Math.ceil(pattern.length / 2)) : 1;
  triggerIOSHaptic(pulses);
}

function hideFeedbackUnlock() {
  document.getElementById('feedbackUnlockView')?.classList.add('hidden');
}

function showFeedbackUnlock() {
  document.getElementById('feedbackUnlockView')?.classList.remove('hidden');
}

export function needsFeedbackUnlock() {
  if (!isIOS()) {
    return false;
  }

  return !feedbackReady && sessionStorage.getItem(FEEDBACK_READY_KEY) !== '1';
}

export async function unlockFeedback() {
  setPlaybackAudioSession();

  const context = ensureAudioContext();
  primeSilentAudioSync();
  primeAudioContext(context);

  if (context?.state === 'suspended') {
    void context.resume();
  }

  playTone({ frequency: 420, duration: 0.04, volume: 0.03, force: true });
  triggerIOSHaptic(1);

  feedbackReady = true;
  sessionStorage.setItem(FEEDBACK_READY_KEY, '1');
  hideFeedbackUnlock();

  if (context?.state === 'suspended') {
    await context.resume();
  }

  await primeSilentAudio();
}

export function initFeedback() {
  silentAudio = document.getElementById('silentUnlock');
  feedbackReady = sessionStorage.getItem(FEEDBACK_READY_KEY) === '1';

  const unlockButton = document.getElementById('feedbackUnlockButton');
  if (unlockButton) {
    unlockButton.addEventListener('click', () => {
      void unlockFeedback();
    });
  }

  if (needsFeedbackUnlock()) {
    showFeedbackUnlock();
  }

  const unlockFromGesture = () => {
    if (!feedbackReady && isIOS()) {
      return;
    }

    ensureAudioContext();
  };

  document.addEventListener('touchend', unlockFromGesture, { capture: true, passive: true });
  document.addEventListener('pointerup', unlockFromGesture, { capture: true, passive: true });
}

function runFeedback(play) {
  if (isIOS() && !feedbackReady) {
    showFeedbackUnlock();
    return;
  }

  ensureAudioContext();
  play();
}

export function playRevealFeedback() {
  runFeedback(() => {
    playTone({ frequency: 520, duration: 0.05, volume: 0.04 });
    playTone({ frequency: 760, duration: 0.07, volume: 0.035, start: 0.03 });
    vibrate(6);
  });
}

export function playGoodFeedback() {
  runFeedback(() => {
    playTone({ frequency: 523.25, duration: 0.11, volume: 0.075 });
    playTone({ frequency: 659.25, duration: 0.13, volume: 0.08, start: 0.08 });
    playTone({ frequency: 783.99, duration: 0.18, volume: 0.07, start: 0.17 });
    vibrate([12, 35, 10]);
  });
}

export function playBadFeedback() {
  runFeedback(() => {
    playTone({ frequency: 196, duration: 0.09, type: 'square', volume: 0.048 });
    playTone({ frequency: 164.81, duration: 0.11, type: 'square', volume: 0.054, start: 0.1 });
    playTone({ frequency: 138.59, duration: 0.14, type: 'triangle', volume: 0.045, start: 0.2 });
    vibrate([30, 45, 35, 45, 30]);
  });
}

export function playCompleteFeedback() {
  runFeedback(() => {
    playTone({ frequency: 523.25, duration: 0.1, volume: 0.065 });
    playTone({ frequency: 659.25, duration: 0.1, volume: 0.07, start: 0.07 });
    playTone({ frequency: 783.99, duration: 0.12, volume: 0.075, start: 0.14 });
    playTone({ frequency: 1046.5, duration: 0.22, volume: 0.06, start: 0.22 });
    vibrate([14, 40, 14, 40, 18]);
  });
}

export function playTapFeedback() {
  runFeedback(() => {
    playTone({ frequency: 420, duration: 0.04, volume: 0.03 });
    vibrate(5);
  });
}
