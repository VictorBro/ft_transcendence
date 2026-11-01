-- AlterTable
ALTER TABLE "UserLevel" ADD COLUMN     "challengesDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastChallengeDay" DATE,
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserAchievement" (
    "userLevelId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userLevelId","code")
);

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userLevelId_fkey" FOREIGN KEY ("userLevelId") REFERENCES "UserLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
