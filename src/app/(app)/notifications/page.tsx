"use client";

import { useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";

type NotifData = Record<string, string>;

function FriendRequestActions({
  requesterId,
  notifId,
  onDone,
}: {
  requesterId: string;
  notifId: string;
  onDone: () => void;
}) {
  const respond = api.friends.respondToRequest.useMutation({ onSuccess: onDone });
  const markRead = api.notifications.markRead.useMutation({ onSuccess: onDone });

  function handle(accept: boolean) {
    respond.mutate({ requesterId, accept });
    markRead.mutate({ id: notifId });
  }

  return (
    <div className="flex gap-2 shrink-0">
      <Button size="sm" onClick={() => handle(true)} disabled={respond.isPending}>
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => handle(false)} disabled={respond.isPending}>
        Decline
      </Button>
    </div>
  );
}

function notifMessage(type: string, data: NotifData): string {
  switch (type) {
    case "friend_request_received":
      return `${data.requesterName ?? "Someone"} sent you a friend request.`;
    case "friend_request_accepted":
      return `${data.acceptorName ?? "Someone"} accepted your friend request.`;
    case "group_invite_received":
      return `You were invited to join ${data.groupName ?? "a group"}.`;
    default:
      return "You have a new notification.";
  }
}

export default function NotificationsPage() {
  const { data: notifs = [], refetch } = api.notifications.list.useQuery({ limit: 50 });
  const utils = api.useUtils();
  const markAll = api.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void refetch();
      void utils.notifications.unreadCount.invalidate();
    },
  });
  const markAllExcept = api.notifications.markAllReadExcept.useMutation({
    onSuccess: () => {
      void refetch();
      void utils.notifications.unreadCount.invalidate();
    },
  });
  const markOne = api.notifications.markRead.useMutation({ onSuccess: () => void refetch() });

  // Auto-mark non-actionable notifications read on page load — single DB call, no loop.
  // friend_request_received stays unread until the user accepts or declines.
  const hasMarkedRef = useRef(false);
  useEffect(() => {
    if (hasMarkedRef.current || notifs.length === 0) return;
    hasMarkedRef.current = true;
    const hasActionable = notifs.some(
      (n) => n.type === "friend_request_received" && !n.readAt
    );
    if (hasActionable) {
      markAllExcept.mutate({ excludeTypes: ["friend_request_received"] });
    } else {
      markAll.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs.length]);

  const unreadCount = notifs.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
      </div>

      {notifs.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      )}

      <ul className="space-y-1">
        {notifs.map((n) => {
          const data = n.data as NotifData;
          // Show Accept/Decline only while unread — once acted on, onDone marks it read
          const isPendingRequest = n.type === "friend_request_received" && !n.readAt;
          return (
            <li
              key={n.id}
              className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${!n.readAt ? "bg-muted/40" : ""}`}
            >
              <div className="space-y-0.5">
                <p className={`text-sm ${!n.readAt ? "font-medium" : ""}`}>
                  {notifMessage(n.type, data)}
                </p>
                <p
                  className="text-xs text-muted-foreground"
                  title={new Date(n.createdAt).toLocaleString()}
                >
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
              {isPendingRequest && data.requesterId ? (
                <FriendRequestActions
                  requesterId={data.requesterId}
                  notifId={n.id}
                  onDone={() => void refetch()}
                />
              ) : !n.readAt ? (
                <button
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => markOne.mutate({ id: n.id })}
                >
                  Dismiss
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
