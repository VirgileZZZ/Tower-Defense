// ---------------------------------------------------------------------------
// Sound — petits sons synthétisés en WebAudio (aucun fichier externe).
// Le contexte n'est créé qu'après le premier geste utilisateur (politique
// autoplay des navigateurs). Les tirs sont throttillés pour ne pas noyer
// l'audio quand plusieurs tours tirent la même frame.
// ---------------------------------------------------------------------------

export class SFX {
  constructor() {
    this.enabled = true;      // piloté par Paramètres → Sound on/off
    this.ctx = null;          // AudioContext, créé à la volée
    this.master = null;       // GainNode maître
    this._noiseBuf = null;    // buffer de bruit blanc réutilisé
    this._lastShootAt = 0;   // horloge de throttle des tirs (ms)
    this._lastHitAt = 0;     // idem pour les impacts
  }

  setEnabled(on) { this.enabled = !!on; if (!on && this.master) this.master.gain.value = 0; else if (this.master) this.master.gain.value = 0.16; }

  // À appeler depuis un handler de clic/keystroke pour lever le blocage autoplay.
  unlock() { this._ensureCtx(); }

  _ensureCtx() {
    if (!this.enabled && !this.ctx) return false;
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.16; // volume global modeste
      this.master.connect(this.ctx.destination);

      // bruit blanc réutilisable (impacts, explosions)
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { /* WebAudio indisponible : on mute sans planter */ this.ctx = null; }
    return !!this.ctx;
  }

  _t() { return this.ctx ? this.ctx.currentTime : performance.now(); }

  // -- primitives ----------------------------------------------------------
  tone(freq, dur, opts = {}) {
    if (!this._ensureCtx()) return;
    const t0 = this.ctx.currentTime + (opts.delay || 0);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(opts.vol ?? 0.5, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    const o = this.ctx.createOscillator();
    o.type = opts.type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + opts.slide), t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = opts.filter || 'lowpass';
    f.frequency.value = opts.freq ?? 3600;
    o.connect(f).connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  noise(dur, vol = 0.4, freq = 2400) {
    if (!this._ensureCtx()) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // -- sons du jeu ---------------------------------------------------------
  shoot(kind = 'bullet') {
    const now = performance.now();
    if (now - this._lastShootAt < 55) return; // throttle : jamais plus d'un tir / 55 ms
    this._lastShootAt = now;
    switch (kind) {
      case 'bullet':   this.tone(880, 0.06, { vol: 0.32, slide: -520 }); break;                       // tic-ping
      case 'shell':    this.noise(0.12, 0.4, 900);  this.tone(190, 0.14, { type: 'square', vol: 0.3, slide: -120 }); break; // boum
      case 'frost':    this.tone(2600, 0.1, { vol: 0.18, filter: 'highpass' }); break;              // fzzz glacé
      case 'fireball': this.noise(0.14, 0.35, 1400); this.tone(260, 0.16, { type: 'sawtooth', vol: 0.22, slide: -160 }); break;
      case 'shock':    this.noise(0.09, 0.5, 3200); this.tone(1400, 0.08, { type: 'square', vol: 0.2, slide: -1200 }); break; // crépitement électrique
    }
  }

  hit() { // impact zombie (léger, très throttle pour rester discret)
    const now = performance.now(); if (now - this._lastHitAt < 90) return; this._lastHitAt = now;
    this.tone(340, 0.05, { vol: 0.16, type: 'square', slide: -180 });
  }

  kill() { // mort zombie : pop descendante + souffle
    this.tone(520, 0.16, { vol: 0.4, slide: -360 });
    this.noise(0.1, 0.22, 700);
  }

  killBig() { // boss / gros : double couche
    this.tone(300, 0.35, { type: 'sawtooth', vol: 0.5, slide: -240 });
    this.noise(0.45, 0.5, 420);
  }

  place() { // placement de tour : clac + ping
    this.tone(210, 0.09, { type: 'square', vol: 0.3 });
    this.tone(760, 0.18, { vol: 0.22, delay: 0.05 });
  }

  sell() { this.tone(440, 0.09, { vol: 0.3, slide: -160 }); this.tone(280, 0.14, { vol: 0.22, delay: 0.07 }); }

  buy() { // achat boutique : petite montante satisfaisante
    this.tone(520, 0.1, { vol: 0.34 }); this.tone(680, 0.1, { vol: 0.34, delay: 0.07 }); this.tone(920, 0.16, { vol: 0.3, delay: 0.15 });
  }

  upgrade() { this.tone(430, 0.1, { vol: 0.3 }); this.tone(580, 0.12, { vol: 0.3, delay: 0.08 }); this.tone(760, 0.14, { vol: 0.26, delay: 0.16 }); }

  click() { this.tone(1500, 0.035, { type: 'sine', vol: 0.2 }); }

  waveStart() { // alarme de vague : two-tone descendante
    this.tone(480, 0.16, { type: 'square', vol: 0.32, filter: 'bandpass' });
    this.tone(350, 0.24, { type: 'square', vol: 0.32, delay: 0.16, filter: 'bandpass' });
  }

  baseHit() { // la base encaisse : gong grave + choc
    this.tone(95, 0.5, { type: 'sine', vol: 0.7, slide: -30 });
    this.noise(0.25, 0.6, 180);
  }

  win() { // victoire : petite fanfare
    const seq = [440, 554, 659, 880];
    seq.forEach((f, i) => this.tone(f, 0.22, { vol: 0.38, delay: i * 0.13 }));
    this.tone(1108, 0.5, { vol: 0.34, delay: seq.length * 0.13 });
  }

  lose() { // défaite : glissando grave
    if (!this._ensureCtx()) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(320, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + 1.4);
    g.gain.setValueAtTime(0.001, t0);
    g.gain.linearRampToValueAtTime(0.5, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + 1.7);
  }

  dispose() { try { this.ctx && this.ctx.close(); } catch {} this.ctx = null; }
}
