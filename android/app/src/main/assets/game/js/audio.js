/* ------------------------------------------------------------------
 * audio.js — every sound in the game, synthesised at runtime.
 *
 * No audio files ship in the APK: each cue is built from oscillators and
 * noise buffers. That keeps the package tiny, keeps the CSP at
 * default-src 'none', and lets a cue be retuned by changing a number
 * instead of re-rendering an asset.
 * ------------------------------------------------------------------ */

const Sfx = (() => {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let musicNodes = [];
  let enabled = { sfx: true, music: true };

  function context() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (err) {
      console.warn('[audio] unavailable:', err && err.message);
      ctx = null;
    }
    return ctx;
  }

  /** Browsers hold the audio clock until a gesture; call this on first tap. */
  function unlock() {
    const c = context();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function setEnabled(kind, on) {
    enabled[kind] = on;
    if (kind === 'music') on ? startMusic() : stopMusic();
  }

  function isEnabled(kind) { return enabled[kind]; }

  /* ---------------- building blocks ---------------- */

  function envelope(node, peak, attack, decay, at) {
    const g = node.gain;
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  }

  function tone(freq, opts) {
    const c = context();
    if (!c || !enabled.sfx) return;
    const o = opts || {};
    const at = c.currentTime + (o.delay || 0);

    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, at);
    if (o.sweepTo) osc.frequency.exponentialRampToValueAtTime(o.sweepTo, at + (o.sweep || 0.2));

    envelope(gain, o.peak || 0.18, o.attack || 0.01, o.decay || 0.2, at);

    osc.connect(gain);
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.cutoff || 900;
      gain.connect(f);
      f.connect(master);
    } else {
      gain.connect(master);
    }
    osc.start(at);
    osc.stop(at + (o.attack || 0.01) + (o.decay || 0.2) + 0.05);
  }

  function noise(opts) {
    const c = context();
    if (!c || !enabled.sfx) return;
    const o = opts || {};
    const at = c.currentTime + (o.delay || 0);
    const duration = o.duration || 0.18;

    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Decaying white noise: the body of every impact in the game.
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }

    const src = c.createBufferSource();
    src.buffer = buffer;

    const filter = c.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 800, at);
    if (o.sweepTo) filter.frequency.exponentialRampToValueAtTime(o.sweepTo, at + duration);
    filter.Q.value = o.q || 1.2;

    const gain = c.createGain();
    envelope(gain, o.peak || 0.22, 0.005, duration, at);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(at);
  }

  function chord(freqs, opts) {
    freqs.forEach((f, i) => tone(f, Object.assign({}, opts, {
      delay: (opts && opts.delay || 0) + i * (opts && opts.stagger || 0.06)
    })));
  }

  /* ---------------- the cue sheet ---------------- */

  const CUES = {
    tap:      () => tone(660, { type: 'triangle', peak: 0.07, attack: 0.005, decay: 0.06 }),
    back:     () => tone(360, { type: 'triangle', peak: 0.07, attack: 0.005, decay: 0.08 }),
    error:    () => tone(180, { type: 'square', peak: 0.08, attack: 0.01, decay: 0.18 }),
    confirm:  () => chord([523, 784], { type: 'triangle', peak: 0.1, decay: 0.22, stagger: 0.05 }),

    // summon
    charge:   () => tone(160, { type: 'sawtooth', peak: 0.12, attack: 0.4, decay: 0.5,
                                sweepTo: 900, sweep: 0.85, filter: 'lowpass', cutoff: 1800 }),
    reveal_common:    () => { noise({ freq: 700, peak: 0.12, duration: 0.14 });
                              tone(330, { type: 'triangle', peak: 0.1, decay: 0.18 }); },
    reveal_rare:      () => { noise({ freq: 1100, peak: 0.16, duration: 0.2, sweepTo: 400 });
                              chord([440, 660], { type: 'triangle', peak: 0.12, decay: 0.3 }); },
    reveal_epic:      () => { noise({ freq: 1600, peak: 0.2, duration: 0.3, sweepTo: 300 });
                              chord([523, 784, 1046], { type: 'triangle', peak: 0.13, decay: 0.5, stagger: 0.07 }); },
    reveal_legendary: () => { noise({ freq: 2200, peak: 0.26, duration: 0.5, sweepTo: 200, q: 0.8 });
                              chord([523, 659, 784, 1046, 1318],
                                    { type: 'sawtooth', peak: 0.14, decay: 0.9, stagger: 0.08,
                                      filter: 'lowpass', cutoff: 2400 });
                              tone(65, { type: 'sine', peak: 0.3, attack: 0.02, decay: 1.1 }); },

    // combat
    hit:      () => noise({ freq: 600, peak: 0.18, duration: 0.12, sweepTo: 200 }),
    crit:     () => { noise({ freq: 1400, peak: 0.26, duration: 0.22, sweepTo: 180, q: 0.9 });
                      tone(110, { type: 'square', peak: 0.14, decay: 0.18 }); },
    ability:  () => { tone(880, { type: 'triangle', peak: 0.14, decay: 0.35, sweepTo: 1760, sweep: 0.3 });
                      noise({ freq: 2000, peak: 0.1, duration: 0.25, sweepTo: 600 }); },
    heal:     () => chord([659, 880, 1319], { type: 'sine', peak: 0.1, decay: 0.4, stagger: 0.05 }),
    shield:   () => tone(420, { type: 'sine', peak: 0.13, decay: 0.4, sweepTo: 640, sweep: 0.35 }),
    ko:       () => { noise({ freq: 400, peak: 0.2, duration: 0.35, sweepTo: 90 });
                      tone(150, { type: 'sawtooth', peak: 0.14, decay: 0.4, sweepTo: 50, sweep: 0.35 }); },
    victory:  () => chord([523, 659, 784, 1046], { type: 'triangle', peak: 0.16, decay: 0.8, stagger: 0.11 }),
    defeat:   () => chord([392, 311, 262], { type: 'sawtooth', peak: 0.13, decay: 0.9, stagger: 0.16,
                                             filter: 'lowpass', cutoff: 1200 }),
    levelup:  () => chord([784, 988, 1175], { type: 'triangle', peak: 0.15, decay: 0.6, stagger: 0.07 })
  };

  function play(cue) {
    const fn = CUES[cue];
    if (!fn) return;
    try { fn(); } catch (err) { /* never let a sound break a turn */ }
  }

  /* ---------------- ambience ---------------- */

  /** A slow two-note drone with a filtered noise bed: a hangar, humming. */
  function startMusic() {
    const c = context();
    if (!c || !enabled.music || musicNodes.length) return;

    musicGain = c.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.gain.exponentialRampToValueAtTime(0.055, c.currentTime + 3);
    musicGain.connect(master);

    [55, 82.5, 110].forEach((freq, i) => {
      const osc = c.createOscillator();
      osc.type = i === 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;

      const lfo = c.createOscillator();
      const lfoGain = c.createGain();
      lfo.frequency.value = 0.05 + i * 0.017;   // slow, unsynchronised drift
      lfoGain.gain.value = freq * 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      const g = c.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.5;
      osc.connect(g);
      g.connect(musicGain);

      osc.start();
      lfo.start();
      musicNodes.push(osc, lfo);
    });
  }

  function stopMusic() {
    const c = context();
    if (!c || !musicNodes.length) return;
    try {
      musicGain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.8);
      musicNodes.forEach(n => n.stop(c.currentTime + 1));
    } catch (err) { /* already stopped */ }
    musicNodes = [];
  }

  return { unlock, play, setEnabled, isEnabled, startMusic, stopMusic };
})();
