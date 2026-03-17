"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NotificationsSkeleton } from "@/components/ui/skeletons";

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

/** Returns a client-side link for a notification, or null if not applicable. */
function notifLink(type: string, data: NotifData): string | null {
  switch (type) {
    case "post_comment":
    case "post_like":
      return data.postId ? `/feed/${data.postId}` : "/feed";
    case "comment_like":
      return data.postId ? `/feed/${data.postId}` : "/feed";
    case "group_invite_received":
      return "/groups";
    default:
      return null;
  }
}

function notifMessage(type: string, data: NotifData): string {
  switch (type) {
    case "friend_request_received":
      return `${data.requesterName ?? "Someone"} sent you a friend request.`;
    case "friend_request_accepted":
      return `${data.acceptorName ?? "Someone"} accepted your friend request.`;
    case "group_invite_received":
      return `You were invited to join ${data.groupName ?? "a group"}.`;
    case "post_comment":
      return `${data.commenterName ?? "Someone"} commented on your post.`;
    case "post_like":
      return `${data.likerName ?? "Someone"} liked your post.`;
    case "comment_like":
      return `${data.likerName ?? "Someone"} liked your comment.`;
    default:
      return "You have a new notification.";
  }
}

export default function NotificationsPage() {
  const { data: notifs = [], isLoading, refetch } = api.notifications.list.useQuery({ limit: 50 });
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
  // Intentionally fire-once: mutation refs and notifs omitted — including them would
  // re-trigger on every refetch after markRead runs, defeating the "mark once" intent.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs.length]);

  const unreadCount = notifs.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <NotificationsSkeleton />
      ) : notifs.length === 0 ? (
        <EmptyState
          icon={
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          }
          heading="You're all caught up"
          description="No new notifications."
        />
      ) : (
        <ul className="space-y-1">
          {notifs.map((n) => {
            const data = n.data as NotifData;
            // Show Accept/Decline only while unread — once acted on, onDone marks it read
            const isPendingRequest = n.type === "friend_request_received" && !n.readAt;
            const link = notifLink(n.type, data);
            const message = notifMessage(n.type, data);
            return (
              <li
                key={n.id}
                className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${!n.readAt ? "bg-muted/40" : ""}`}
              >
                <div className="space-y-0.5">
                  <p className={`text-sm ${!n.readAt ? "font-medium" : ""}`}>
                    {link ? (
                      <Link href={link} className="hover:underline">
                        {message}
                      </Link>
                    ) : message}
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
      )}
    </div>
  );
}
