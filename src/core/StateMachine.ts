import { CharacterState } from '../models/types';

export interface AnimationStep { animation: string; duration: number }
interface TemporaryState { state: CharacterState; priority: number; started: number; duration: number; steps: AnimationStep[] }

const stateAnimations: Record<CharacterState, string> = {
  IDLE: 'idle_blink', CODING: 'coding_loop', VIBE_CODING: 'vibe_coding_loop', THINKING: 'thinking',
  HAPPY: 'happy', VERY_HAPPY: 'very_happy', SAD: 'sad', VERY_SAD: 'very_sad', TIRED: 'idle_sleepy',
  SLEEPING: 'sleep', LISTENING_MUSIC: 'music_loop', DANCING: 'dance_01', ERROR: 'error_notice',
  SUCCESS: 'success', CONFUSED: 'error_confused', BORED: 'idle_yawn', AFK: 'idle_watch_window', CELEBRATING: 'celebrate',
};
function basePriority(state: CharacterState): number {
  if (state === 'CODING' || state === 'VIBE_CODING' || state === 'THINKING') { return 30; }
  return state === 'LISTENING_MUSIC' ? 20 : 0;
}

/** Temporary reactions cover a continuously updated base state, then restore it. */
export class StateMachine {
  private baseState: CharacterState = 'IDLE';
  private baseAnimation = 'idle_blink';
  private transition: { animation: string; until: number } | undefined;
  private temporary: TemporaryState | undefined;

  setBase(state: CharacterState, now: number, animation = stateAnimations[state], transitions = true): void {
    const previous = this.baseState;
    this.baseState = state;
    this.baseAnimation = animation;
    if (this.temporary && this.temporary.priority < basePriority(state)) { this.temporary = undefined; }
    if (previous === state) { return; }
    this.transition = undefined;
    if (!transitions) { return; }
    if (state === 'CODING') { this.transition = { animation: 'coding_start', until: now + 700 }; }
    else if (state === 'VIBE_CODING') { this.transition = { animation: 'vibe_coding_start', until: now + 800 }; }
    else if (state !== 'SLEEPING' && (previous === 'CODING' || previous === 'VIBE_CODING')) {
      this.transition = { animation: previous === 'CODING' ? 'coding_stop' : 'vibe_coding_end', until: now + 600 };
    }
  }

  react(state: CharacterState, animation: string, duration: number, priority: number, now: number, steps?: AnimationStep[]): boolean {
    this.advance(now);
    if (priority < basePriority(this.baseState)) { return false; }
    if (this.temporary && this.temporary.priority > priority) { return false; }
    if (this.temporary?.state === state && this.temporary.steps[0]?.animation === animation) { return false; }
    this.temporary = { state, priority, started: now, duration, steps: steps ?? [{ animation, duration }] };
    return true;
  }

  advance(now: number): void {
    if (this.temporary && now >= this.temporary.started + this.temporary.duration) { this.temporary = undefined; }
    if (this.transition && now >= this.transition.until) { this.transition = undefined; }
  }

  view(now: number): { state: CharacterState; animation: string } {
    this.advance(now);
    if (this.temporary) {
      let elapsed = now - this.temporary.started;
      for (const step of this.temporary.steps) {
        if (elapsed < step.duration) { return { state: this.temporary.state, animation: step.animation }; }
        elapsed -= step.duration;
      }
      return { state: this.temporary.state, animation: this.temporary.steps[this.temporary.steps.length - 1]?.animation ?? 'idle_blink' };
    }
    return { state: this.baseState, animation: this.transition?.animation ?? this.baseAnimation };
  }

  clearTemporary(): void { this.temporary = undefined; this.transition = undefined; }
  get hasReaction(): boolean { return this.temporary !== undefined; }
}
