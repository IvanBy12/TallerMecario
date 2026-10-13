export class S4CheckFailure extends Error {
  constructor(message: string) { super(message); this.name = 'S4CheckFailure'; }
}
export function s4Check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new S4CheckFailure(message);
}
