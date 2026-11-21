/* The Quiet Archive — sounds.
   Every sound is synthesised with WebAudio at play time. No audio files,
   no network, nothing to load. */
'use strict';

const ArchiveAudio = (() => {
  let ctx = null;
  let muted = false;
  let stepTick = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + when;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, lowFreq) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() { return muted; },
    step(sneaking) {
      // Soft alternate ticks; silent while sneaking.
      if (sneaking) return;
      stepTick++;
      noise(0.05, stepTick % 2 === 0 ? 0.05 : 0.035, 500);
    },
    pickup() {
      tone(660, 0.12, 'sine', 0.16);
      tone(990, 0.18, 'sine', 0.14, 0.09);
    },
    alert() {
      tone(220, 0.28, 'sawtooth', 0.10, 0, 330);
      tone(165, 0.3, 'square', 0.05, 0.05, 247);
    },
    caught() {
      tone(392, 0.22, 'triangle', 0.16, 0, 196);
      tone(311, 0.3, 'triangle', 0.16, 0.18, 155);
      tone(233, 0.5, 'triangle', 0.16, 0.36, 116);
    },
    unlock_exit() {
      tone(523, 0.14, 'sine', 0.14);
      tone(659, 0.14, 'sine', 0.14, 0.12);
      tone(784, 0.26, 'sine', 0.14, 0.24);
    },
    win() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, 0.32, 'sine', 0.15, i * 0.14));
    },
    click() { tone(880, 0.05, 'sine', 0.08); },
  };
})();
