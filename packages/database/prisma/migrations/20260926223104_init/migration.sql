-- CreateEnum
CREATE TYPE "ExecutionStrategy" AS ENUM ('AUTO', 'SEARCH', 'SCRAPE', 'CRAWL', 'AGENT');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "FailureCategory" AS ENUM ('TIMEOUT', 'RATE_LIMIT', 'FIRECRAWL_ERROR', 'NO_RESULTS', 'INVALID_SCHEMA', 'INSUFFICIENT_SOURCES', 'PARSING_ERROR', 'EVALUATOR_FAILURE', 'NETWORK_FAILURE', 'AUTH_ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taskPrompt" TEXT NOT NULL,
    "startingUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "strategy" "ExecutionStrategy" NOT NULL DEFAULT 'SEARCH',
    "expectedSchema" JSONB,
    "evaluatorConfig" JSONB,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "maxFirecrawlCalls" INTEGER NOT NULL DEFAULT 5,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "minSources" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PENDING',
    "strategy" "ExecutionStrategy" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCategory" "FailureCategory",
    "finalOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionAttempt" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "strategy" "ExecutionStrategy" NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "errorCategory" "FailureCategory",
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "firecrawlCallCount" INTEGER NOT NULL DEFAULT 0,
    "rawResultRef" TEXT,

    CONSTRAINT "ExecutionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "rank" INTEGER,
    "contentRef" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "status" "RunStatus" NOT NULL,
    "recommendation" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "supportedClaims" INTEGER,
    "unsupportedClaims" INTEGER,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasoningSummary" TEXT NOT NULL,
    "evaluatorProvider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "totalRuns" INTEGER NOT NULL,
    "successCount" INTEGER NOT NULL,
    "partialCount" INTEGER NOT NULL,
    "failureCount" INTEGER NOT NULL,
    "avgLatencyMs" DOUBLE PRECISION,
    "medianLatencyMs" DOUBLE PRECISION,
    "p95LatencyMs" DOUBLE PRECISION,
    "schemaValidPct" DOUBLE PRECISION,
    "groundedPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationSuite" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationSuite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuiteEvaluation" (
    "id" TEXT NOT NULL,
    "suiteId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SuiteEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Evaluation_userId_idx" ON "Evaluation"("userId");

-- CreateIndex
CREATE INDEX "Run_evaluationId_idx" ON "Run"("evaluationId");

-- CreateIndex
CREATE INDEX "Run_status_idx" ON "Run"("status");

-- CreateIndex
CREATE INDEX "Run_createdAt_idx" ON "Run"("createdAt");

-- CreateIndex
CREATE INDEX "ExecutionAttempt_runId_idx" ON "ExecutionAttempt"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionAttempt_runId_attemptNumber_key" ON "ExecutionAttempt"("runId", "attemptNumber");

-- CreateIndex
CREATE INDEX "Source_runId_idx" ON "Source"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResult_runId_key" ON "EvaluationResult"("runId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_scope_scopeId_idx" ON "MetricSnapshot"("scope", "scopeId");

-- CreateIndex
CREATE UNIQUE INDEX "SuiteEvaluation_suiteId_evaluationId_key" ON "SuiteEvaluation"("suiteId", "evaluationId");

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionAttempt" ADD CONSTRAINT "ExecutionAttempt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExecutionAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResult" ADD CONSTRAINT "EvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteEvaluation" ADD CONSTRAINT "SuiteEvaluation_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "EvaluationSuite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuiteEvaluation" ADD CONSTRAINT "SuiteEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
