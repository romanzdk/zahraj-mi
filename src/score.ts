import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export class ScoreView {
  private osmd: OpenSheetMusicDisplay | null = null;
  private lastQuarter = 0;
  private cursorVisible = false;

  constructor(private readonly container: HTMLElement) {}

  async show(musicXml: string): Promise<void> {
    if (!this.osmd) {
      const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
      this.osmd = new OpenSheetMusicDisplay(this.container, {
        autoResize: true,
        backend: "svg",
        drawTitle: true,
        drawPartNames: false,
        drawingParameters: "compacttight",
        followCursor: true,
      });
    }
    this.hideCursor();
    await this.osmd.load(musicXml);
    // OSMD prints "Untitled Score" when the recognizer found no title.
    this.osmd.setOptions({ drawTitle: Boolean(this.osmd.Sheet?.TitleString && this.osmd.Sheet.TitleString !== "Untitled Score") });
    this.osmd.render();
  }

  /** Moves the highlight to the note that starts at the given position (in quarter notes). */
  moveTo(quarter: number): void {
    const cursor = this.osmd?.cursor;
    if (!cursor) return;
    if (!this.cursorVisible || quarter < this.lastQuarter) {
      cursor.reset();
      cursor.show();
      this.cursorVisible = true;
    }
    try {
      while (!cursor.Iterator.EndReached && cursor.Iterator.currentTimeStamp.RealValue * 4 < quarter - 1e-6) {
        cursor.next();
      }
    } catch {
      // A score OSMD cannot walk should not stop the music.
    }
    this.lastQuarter = quarter;
  }

  hideCursor(): void {
    this.osmd?.cursor?.hide();
    this.cursorVisible = false;
    this.lastQuarter = 0;
  }
}
