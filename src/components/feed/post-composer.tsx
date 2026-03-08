"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MAX_CHARS = 1000;

export function PostComposer({ groupId, onPosted }: { groupId?: string; onPosted: () => void }) {
  const [body, setBody] = useState("");

  const create = api.feed.create.useMutation({
    onSuccess: () => {
      setBody("");
      onPosted();
    },
  });

  const remaining = MAX_CHARS - body.length;
  const nearLimit = remaining <= 100;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    create.mutate({ body: body.trim(), groupId });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border p-4">
      <Textarea
        placeholder="What's on your mind?"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_CHARS}
      />
      <div className="flex items-center justify-between">
        <span className={`text-xs ${nearLimit ? "text-destructive" : "text-muted-foreground"}`}>
          {remaining} chars remaining
        </span>
        <Button type="submit" size="sm" disabled={!body.trim() || create.isPending}>
          {create.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
