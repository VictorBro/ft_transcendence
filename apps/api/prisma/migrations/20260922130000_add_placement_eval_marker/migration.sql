ALTER TABLE "UserLevel"
ADD COLUMN "last_eval_session" UUID,
ADD COLUMN "last_eval_level" "TargetLevel";
