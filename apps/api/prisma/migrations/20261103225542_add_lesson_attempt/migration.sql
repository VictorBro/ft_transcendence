-- CreateTable
CREATE TABLE "LessonAttempt" (
    "id" UUID NOT NULL,
    "userLevelId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "motherTongue" "Locale" NOT NULL,
    "secret" BYTEA NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "page" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '{}',
    "completedAt" TIMESTAMP(3),
    "results" JSONB,

    CONSTRAINT "LessonAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonAttempt_userLevelId_lessonId_key" ON "LessonAttempt"("userLevelId", "lessonId");

-- AddForeignKey
ALTER TABLE "LessonAttempt" ADD CONSTRAINT "LessonAttempt_userLevelId_fkey" FOREIGN KEY ("userLevelId") REFERENCES "UserLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonAttempt" ADD CONSTRAINT "LessonAttempt_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
