-- CreateEnum
CREATE TYPE "LessonKind" AS ENUM ('grammar', 'vocabulary', 'functions', 'reading');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('personal_identification', 'house_and_home', 'daily_life', 'free_time', 'travel', 'relations', 'health', 'education', 'shopping', 'food_and_drink', 'services', 'places', 'language', 'weather');

-- AlterTable
ALTER TABLE "UserLevel" ADD COLUMN     "bestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastGoalDay" DATE,
ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Lesson" (
    "id" TEXT NOT NULL,
    "lang" "Language" NOT NULL,
    "level" "Level" NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "LessonKind" NOT NULL,
    "topic" "Topic",
    "theme" "Theme",
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "brief" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonResult" (
    "userLevelId" UUID NOT NULL,
    "lessonId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonResult_pkey" PRIMARY KEY ("userLevelId","lessonId")
);

-- CreateIndex
CREATE INDEX "Lesson_lang_level_position_idx" ON "Lesson"("lang", "level", "position");

-- CreateIndex
CREATE INDEX "LessonResult_userLevelId_day_idx" ON "LessonResult"("userLevelId", "day");

-- AddForeignKey
ALTER TABLE "LessonResult" ADD CONSTRAINT "LessonResult_userLevelId_fkey" FOREIGN KEY ("userLevelId") REFERENCES "UserLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonResult" ADD CONSTRAINT "LessonResult_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
