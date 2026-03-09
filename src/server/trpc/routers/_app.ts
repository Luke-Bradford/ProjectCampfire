import { createTRPCRouter } from "@/server/trpc/trpc";
import { userRouter } from "./user";
import { friendsRouter } from "./friends";
import { groupsRouter } from "./groups";
import { feedRouter } from "./feed";
import { notificationsRouter } from "./notifications";
import { gamesRouter } from "./games";
import { availabilityRouter } from "./availability";
import { eventsRouter } from "./events";
import { pollsRouter } from "./polls";
import { uploadRouter } from "./upload";

export const appRouter = createTRPCRouter({
  user: userRouter,
  friends: friendsRouter,
  groups: groupsRouter,
  feed: feedRouter,
  notifications: notificationsRouter,
  games: gamesRouter,
  availability: availabilityRouter,
  events: eventsRouter,
  polls: pollsRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
