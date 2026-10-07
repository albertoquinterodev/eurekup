const KEY = "eurekup_msg_sound";

export function isMessageSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(KEY) !== "off";
}

export function setMessageSound(on: boolean) {
  localStorage.setItem(KEY, on ? "on" : "off");
}

let ctx: AudioContext | null = null;

/** Short, subtle two-tone beep using the Web Audio API. */
export function playMessageBeep(force = false) {
  if (typeof window === "undefined") return;
  if (!force && !isMessageSoundOn()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  } catch {
    // Audio not available — ignore.
  }
}
