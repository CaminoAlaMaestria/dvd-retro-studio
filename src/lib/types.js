/* Tipos y constantes del modelo de datos (versión JS del proyecto). */

export const DEFAULT_REMASTER = { sharp: 62, denoise: 40, color: 55, vhs: 75 };
export const NEUTRAL_REMASTER = { sharp: 0, denoise: 0, color: 50, vhs: 0 };

/**
 * @typedef {{ sharp:number, denoise:number, color:number, vhs:number }} Remaster
 * @typedef {{ url?:string, mediaId?:string }} Src
 * @typedef {{ id:string, title:string, start:number, poster:Src, clip?:Src, clipDuration?:number, voiceOver?:Src }} Chapter
 * @typedef {{ id:string, kind:"movie", title:string, kicker:string, subtitle:string, cover:Src,
 *   video?:Src, duration:number, chapters:Chapter[], remaster:Remaster, remasterOn:boolean,
 *   photos:Src[], linkedSlideshows:string[], shareCode:string, createdAt:number }} Movie
 * @typedef {{ id:string, kind:"slideshow", title:string, photos:Src[], seconds:number,
 *   transition:"fade"|"wipe"|"iris", music:{kind:"free",trackId:string}|{kind:"own",mediaId:string,name:string}|{kind:"none"},
 *   shareCode:string, createdAt:number }} Slideshow
 */

export const FREE_TRACKS = [
  { id: "amanecer", name: "Amanecer (libre de derechos)", mood: "Cálida y luminosa" },
  { id: "noche", name: "Noche estrellada (libre de derechos)", mood: "Tranquila y suave" },
  { id: "aventura", name: "Aventura (libre de derechos)", mood: "Animada y ligera" },
];

export const TRANSITIONS = [
  { id: "fade", name: "Fundido" },
  { id: "wipe", name: "Barrido" },
  { id: "iris", name: "Iris" },
];

export function newMovie(title = "Mi película") {
  const now = Date.now();
  return {
    id: `m-${Math.random().toString(36).slice(2, 10)}`,
    kind: "movie",
    title,
    kicker: "Presentación",
    subtitle: "Una producción casera",
    cover: {},
    duration: 0,
    chapters: [],
    remaster: { ...DEFAULT_REMASTER },
    remasterOn: true,
    photos: [],
    linkedSlideshows: [],
    shareCode: `DVD-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: now,
  };
}

export function newSlideshow(title = "Mi pase de fotos") {
  return {
    id: `s-${Math.random().toString(36).slice(2, 10)}`,
    kind: "slideshow",
    title,
    photos: [],
    seconds: 4,
    transition: "fade",
    music: { kind: "free", trackId: "amanecer" },
    shareCode: `DVD-${Math.floor(1000 + Math.random() * 9000)}`,
    createdAt: Date.now(),
  };
}

export function orderedChapters(chapters) {
  return [...chapters].sort((a, b) => a.start - b.start);
}

export function validCut(start, end, duration) {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration + 0.5;
}
