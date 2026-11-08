"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/fields";
import { loginAction } from "@/features/authentication/actions";
import { initialActionState } from "@/lib/action-result";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initialActionState);
  return (
    <Card>
      <form action={action} className="space-y-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        <SubmitButton className="w-full" pendingLabel="Signing in...">
          Sign in
        </SubmitButton>
      </form>
    </Card>
  );
}
