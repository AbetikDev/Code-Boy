export interface TrackInfo { title: string; artist?: string }
export interface MusicProvider {
  readonly name: string;
  isPlaying(): Promise<boolean>;
  getTrackInfo?(): Promise<TrackInfo | null>;
  dispose?(): void;
}
