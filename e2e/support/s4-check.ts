export class S4CheckFailure extends Error {
  constructor(message: string, readonly classification?: 'FAIL' | 'BLOCKED') { super(message); this.name = 'S4CheckFailure'; }
}
export function s4Check(condition: boolean, message: string, classification?: 'FAIL' | 'BLOCKED'): asserts condition {
  if (!condition) throw new S4CheckFailure(message, classification);
}
