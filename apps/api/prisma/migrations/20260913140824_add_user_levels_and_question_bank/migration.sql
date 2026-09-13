-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('vocabulary', 'grammar', 'reading');

-- CreateEnum
CREATE TYPE "Level" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('en', 'fr', 'de');

-- CreateTable
CREATE TABLE "UserLevel" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lang" "Language" NOT NULL,
    "level" "Level",
    "dailyGoal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionBank" (
    "id" UUID NOT NULL,
    "lang" "Language" NOT NULL,
    "level" "Level" NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "readText" TEXT,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "answer" TEXT NOT NULL,
    "generated" BOOLEAN NOT NULL,
    "timeLimitS" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionBank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSeenQuestion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSeenQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLevel_userId_lang_key" ON "UserLevel"("userId", "lang");

-- CreateIndex
CREATE INDEX "QuestionBank_lang_level_category_idx" ON "QuestionBank"("lang", "level", "category");

-- CreateIndex
CREATE UNIQUE INDEX "UserSeenQuestion_userId_questionId_key" ON "UserSeenQuestion"("userId", "questionId");

-- AddForeignKey
ALTER TABLE "UserLevel" ADD CONSTRAINT "UserLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeenQuestion" ADD CONSTRAINT "UserSeenQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSeenQuestion" ADD CONSTRAINT "UserSeenQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
