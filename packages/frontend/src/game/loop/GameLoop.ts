// Fixed-timestep game loop at 60 ticks/sec.
// Logic is decoupled from render frame rate — accumulator pattern.

export const TICK_RATE = 60;
export const TICK_MS = 1000 / TICK_RATE; // 16.667ms per logic tick

export type TickFn = (tick: number, elapsedMs: number) => void;

export class GameLoop {
  private running = false;
  private paused = false;
  private tick = 0;
  private elapsedMs = 0;
  private accumulator = 0;
  private lastTimestamp = 0;
  private rafHandle = 0;
  private readonly onTick: TickFn;
  private readonly onRender: ((alpha: number) => void) | undefined;

  constructor(onTick: TickFn, onRender?: (alpha: number) => void) {
    this.onTick = onTick;
    this.onRender = onRender;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // Reset timestamp to avoid a large dt burst after resuming
    this.lastTimestamp = performance.now();
    this.accumulator = 0;
  }

  get currentTick(): number {
    return this.tick;
  }

  get totalElapsedMs(): number {
    return this.elapsedMs;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  private readonly frame = (timestamp: number): void => {
    if (!this.running) return;

    if (!this.paused) {
      const dt = Math.min(timestamp - this.lastTimestamp, 250); // cap at 250ms to prevent spiral of death
      this.lastTimestamp = timestamp;
      this.accumulator += dt;

      while (this.accumulator >= TICK_MS) {
        this.tick++;
        this.elapsedMs += TICK_MS;
        this.onTick(this.tick, this.elapsedMs);
        this.accumulator -= TICK_MS;
      }

      // alpha = fraction of the next tick that has elapsed (for render interpolation)
      const alpha = this.accumulator / TICK_MS;
      this.onRender?.(alpha);
    } else {
      this.lastTimestamp = timestamp;
    }

    this.rafHandle = requestAnimationFrame(this.frame);
  };
}
