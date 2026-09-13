/*
  Warnings:

  - A unique constraint covering the columns `[sourceId]` on the table `QuestionBank` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "QuestionBank_sourceId_key" ON "QuestionBank"("sourceId");
