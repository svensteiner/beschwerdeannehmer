let activePreview: HTMLAudioElement | null = null;
let previewGeneration = 0;

/** Meldet einen neuen lokalen Tonstart, damit eine laufende Live-Hörprobe sofort sauber endet. */
export const AUDIO_PREVIEW_START_EVENT = "silvia:audio-preview-start";

function notifyAudioPreviewStart() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(AUDIO_PREVIEW_START_EVENT));
}

/** Reserviert die Hörprobe beim Klick und beendet dabei jede ältere Wiedergabe. */
export function beginAudioPreview(): number {
  previewGeneration += 1;
  notifyAudioPreviewStart();
  if (activePreview) {
    activePreview.pause();
    activePreview.currentTime = 0;
    activePreview = null;
  }
  return previewGeneration;
}

/** Stoppt die bisherige Hörprobe, bevor eine neue beginnt. */
export function startAudioPreview(
  audio: HTMLAudioElement,
  generation?: number,
): boolean {
  if (generation !== undefined && generation !== previewGeneration) return false;
  if (generation === undefined) {
    previewGeneration += 1;
    notifyAudioPreviewStart();
  }
  if (activePreview && activePreview !== audio) {
    activePreview.pause();
    activePreview.currentTime = 0;
  }
  activePreview = audio;
  return true;
}

/** Gibt eine Hörprobe frei, ohne eine später gestartete Probe zu beeinflussen. */
export function clearAudioPreview(audio: HTMLAudioElement | null | undefined) {
  if (activePreview === audio) activePreview = null;
}
