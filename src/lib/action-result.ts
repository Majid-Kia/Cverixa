/** Shape returned by server actions used with `useActionState`. */
export type ActionState = {
  ok: boolean;
  error?: string | null;
  message?: string | null;
  fieldErrors?: Record<string, string>;
};

export const initialActionState: ActionState = { ok: false, error: null, message: null };

export function failure(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors };
}

export function success(message?: string): ActionState {
  return { ok: true, error: null, message: message ?? null };
}
