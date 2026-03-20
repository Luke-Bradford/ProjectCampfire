CREATE INDEX "friendships_addressee_requester_status_idx" ON "friendships" USING btree ("addressee_id","requester_id","status");--> statement-breakpoint
CREATE INDEX "friendships_requester_status_idx" ON "friendships" USING btree ("requester_id","status");--> statement-breakpoint
CREATE INDEX "friendships_addressee_status_idx" ON "friendships" USING btree ("addressee_id","status");