ALTER TABLE "reviews" ADD COLUMN "finalized_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_finalized_by_user_id_idx" ON "reviews" USING btree ("finalized_by_user_id");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_finalized_by_check" CHECK (("reviews"."status" = 'FINALIZED') = ("reviews"."finalized_by_user_id" is not null));