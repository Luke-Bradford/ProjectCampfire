"use client";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

export function AddFriendButton({ targetId }: { targetId: string }) {
  const { data, refetch } = api.friends.list.useQuery();

  const send = api.friends.sendRequest.useMutation({ onSuccess: () => void refetch() });
  const cancel = api.friends.cancelRequest.useMutation({ onSuccess: () => void refetch() });
  const respond = api.friends.respondToRequest.useMutation({ onSuccess: () => void refetch() });
  const remove = api.friends.remove.useMutation({ onSuccess: () => void refetch() });

  if (!data) return null;

  const isFriend = data.friends.some((u) => u.id === targetId);
  const isOutgoing = data.outgoing.some((u) => u.id === targetId);
  const isIncoming = data.incoming.some((u) => u.id === targetId);

  if (isFriend) {
    return (
      <Button
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={() => remove.mutate({ friendId: targetId })}
        disabled={remove.isPending}
      >
        Remove friend
      </Button>
    );
  }

  if (isOutgoing) {
    return (
      <Button
        variant="outline"
        onClick={() => cancel.mutate({ addresseeId: targetId })}
        disabled={cancel.isPending}
      >
        Cancel request
      </Button>
    );
  }

  if (isIncoming) {
    return (
      <div className="flex gap-2">
        <Button
          onClick={() => respond.mutate({ requesterId: targetId, accept: true })}
          disabled={respond.isPending}
        >
          Accept request
        </Button>
        <Button
          variant="outline"
          onClick={() => respond.mutate({ requesterId: targetId, accept: false })}
          disabled={respond.isPending}
        >
          Decline
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => send.mutate({ addresseeId: targetId })}
      disabled={send.isPending}
    >
      Add friend
    </Button>
  );
}
