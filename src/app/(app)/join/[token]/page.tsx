"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

export default function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();

  const join = api.groups.join.useMutation({
    onSuccess: ({ id }) => router.push(`/groups/${id}`),
    onError: (err) => {
      alert(err.message);
      router.push("/groups");
    },
  });

  useEffect(() => {
    join.mutate({ inviteToken: token });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <p className="text-muted-foreground">Joining group…</p>
    </div>
  );
}
