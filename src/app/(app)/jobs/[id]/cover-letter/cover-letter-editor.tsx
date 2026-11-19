"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Textarea } from "@/components/ui/fields";
import { saveCoverLetterAction } from "@/features/cover-letter/actions";
import { COVER_LETTER_MAX_LENGTH } from "@/features/cover-letter/schema";
import { initialActionState } from "@/lib/action-result";

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The letter as editable plain text. Edits are saved as written; nothing rewrites them. */
export function CoverLetterEditor({ letterId, body }: { letterId: string; body: string }) {
  const [text, setText] = useState(body);
  // What the server holds; the PDF is made from this, so unsaved edits are pointed out.
  const [saved, setSaved] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = text.trim() !== saved.trim();

  const save = () => {
    const submitted = text;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", letterId);
      formData.set("body", submitted);
      let result;
      try {
        result = await saveCoverLetterAction(initialActionState, formData);
      } catch {
        result = { ok: false, error: "The letter could not be saved. Check your connection and try again." };
      }
      if (result.ok) {
        setSaved(submitted);
        setError(null);
        setJustSaved(true);
      } else {
        setError(result.error ?? "The letter could not be saved.");
      }
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("yes");
    } catch {
      setCopied("failed");
    }
  };

  return (
    <div className="space-y-3">
      <Textarea
        aria-label="Cover letter text"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setCopied(null);
          setJustSaved(false);
        }}
        maxLength={COVER_LETTER_MAX_LENGTH}
        className="min-h-[32rem] leading-relaxed"
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty || !text.trim()} aria-busy={pending}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
        <Button variant="secondary" onClick={copy}>
          Copy text
        </Button>
        <span className="text-muted text-xs" role="status">
          {wordCount(text)} words
          {dirty ? " · unsaved changes (the PDF uses the saved text)" : justSaved ? " · saved" : ""}
          {copied === "yes" ? " · copied" : copied === "failed" ? " · could not copy; select the text instead" : ""}
        </span>
      </div>
    </div>
  );
}
