/*
  Warnings:

  - The `level` column on the `UserLevel` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TargetLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3');

-- AlterTable
ALTER TABLE "UserLevel" DROP COLUMN "level",
ADD COLUMN     "level" "TargetLevel";
