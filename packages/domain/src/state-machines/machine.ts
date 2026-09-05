import { AppError } from '@pcs/security';

/**
 * Explicit, guarded state machine (Data & State Model §33, §56; Master Spec §33).
 * Only declared transitions are permitted; terminal states are final for the
 * normal flow. Administrative recovery, if ever needed, must be a separate,
 * audited path — never a silent backward transition (Data §55).
 */
export interface StateMachine<S extends string> {
  readonly transitions: Readonly<Record<S, readonly S[]>>;
  canTransition(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  isTerminal(state: S): boolean;
}

export function createStateMachine<S extends string>(
  name: string,
  transitions: Readonly<Record<S, readonly S[]>>,
): StateMachine<S> {
  return {
    transitions,
    canTransition(from, to) {
      return transitions[from].includes(to);
    },
    assertTransition(from, to) {
      if (!transitions[from].includes(to)) {
        throw new AppError('CONFLICT', `illegal ${name} transition: ${from} -> ${to}`);
      }
    },
    isTerminal(state) {
      return transitions[state].length === 0;
    },
  };
}
