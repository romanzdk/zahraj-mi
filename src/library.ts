export interface SongSettings {
  tempo: number;
  transpose: number;
  voice: string;
  instrument: string;
  from: number;
  to: number;
  countIn: boolean;
  loop: boolean;
}

export interface Song {
  id: string;
  name: string;
  createdAt: number;
  xml: string;
  /** Small JPEG data URL of the photo; null for MusicXML uploads. */
  thumb: string | null;
  settings: SongSettings | null;
}

// One key per song, so a single broken entry cannot hide the others.
const PREFIX = "zahraj-mi.song.";

export function listSongs(): Song[] {
  const songs: Song[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        songs.push(JSON.parse(localStorage.getItem(key)!) as Song);
      } catch {
        // skip a broken entry
      }
    }
  } catch {
    // storage may be blocked
  }
  return songs.sort((a, b) => b.createdAt - a.createdAt);
}

/** Throws when storage is full or blocked; the caller decides what to tell the user. */
export function saveSong(song: Song): void {
  localStorage.setItem(PREFIX + song.id, JSON.stringify(song));
}

export function updateSong(id: string, patch: Partial<Omit<Song, "id">>): void {
  const raw = localStorage.getItem(PREFIX + id);
  if (raw) saveSong({ ...(JSON.parse(raw) as Song), ...patch });
}

export function deleteSong(id: string): void {
  localStorage.removeItem(PREFIX + id);
}
