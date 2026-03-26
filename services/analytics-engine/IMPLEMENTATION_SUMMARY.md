# Analytics-Engine Microservice Implementation Summary

## Overview
Complete implementation of the `analytics-engine` microservice for VoiceIQ, a SaaS speech analytics platform for offline retail.

## Architecture
The service consumes RabbitMQ `queue.analyze` messages, performs LLM-based analysis against sales scripts, saves results to PostgreSQL `analytics` schema, and publishes cache invalidation events.

## Service Structure

### Core Application (`app/`)
- **main.py** - FastAPI application with lifespan management and worker integration
- **config.py** - Settings management using pydantic-settings
- **database.py** - SQLAlchemy async session management
- **models.py** - Database models (Conversation, ConversationScriptResult, ConversationScore, Objection)
- **llm_client.py** - Async OpenAI client for LLM integration (Ollama/OpenAI compatible)
- **rabbitmq.py** - RabbitMQ connection and message publishing utilities
- **dependencies.py** - JWT authentication and authorization via auth-service
- **scorer.py** - Script scoring logic (weighted sum calculations)
- **prompt_builder.py** - LLM prompt generation for script scoring and general analysis
- **response_parser.py** - Pydantic models for LLM response validation

### Routes (`app/routers/`)
- **conversations.py** - REST API endpoints:
  - GET `/api/v1/analytics/conversations` - List conversations with filtering/pagination
  - GET `/api/v1/analytics/conversations/{id}` - Get detailed conversation with script results
  - GET `/api/v1/analytics/sellers/{seller_id}/stats` - Seller performance analytics
  - POST `/api/v1/analytics/reanalyze/{recording_id}` - Trigger re-analysis (status 202)

### Worker (`worker/`)
- **analyze_worker.py** - Message consumer implementing full analysis pipeline:
  1. Fetch transcript and scripts in parallel
  2. Split scripts into mandatory vs contextual
  3. Screen contextual scripts for applicability (LLM-based)
  4. Score applied scripts in parallel
  5. Run general analysis (outcome, sentiment, objections)
  6. Calculate overall score
  7. Persist results to database
  8. Publish cache invalidation event

### Database (`alembic/`)
- **env.py** - Async Alembic migration environment
- **0001_initial_analytics_schema.py** - Initial schema with 4 tables:
  - `conversations` - Main conversation records
  - `conversation_script_results` - Per-script analysis results
  - `conversation_scores` - Step-level scores
  - `objections` - Customer objections tracking

### Testing (`tests/`)
- **conftest.py** - Test fixtures with PostgresContainer and dependency overrides
- **test_scorer.py** - Unit tests for scoring logic
- **test_response_parser.py** - Pydantic validation tests
- **test_prompt_builder.py** - Prompt generation and LLM screening tests
- **test_analyze_worker.py** - Integration tests for message processing pipeline

## Key Features

### LLM Analysis
- Dual-mode analysis: script compliance scoring + general conversation insights
- Parallel script evaluation with concurrency limiting
- Fallback to defaults on LLM failures (score=unknown, outcome=unknown)
- Supports contextual script filtering (applies scripts only if relevant)

### Scoring System
- Weighted sum calculation for script scores
- Overall score as average of applied scripts
- Step-level evidence tracking with transcript citations
- Violation tracking for compliance issues

### Message Handling
- ACK on successful processing
- NACK on fetch errors (triggers requeue)
- ACK on bad message format (prevents poison messages)
- Error handling with detailed logging

### Security & Isolation
- JWT-based authentication via auth-service
- Organization-level data isolation
- Role-based access control (manager sees only own store)
- Async database operations with connection pooling

## Configuration
Environment variables via `.env` or class defaults:
- `DATABASE_URL` - PostgreSQL async connection string
- `RABBITMQ_URL` - RabbitMQ broker URL
- `LLM_SERVER_URL` - Ollama/OpenAI API endpoint
- `LLM_MODEL_NAME` - Model identifier (default: qwen2.5:14b)
- `LLM_MAX_PARALLEL_SCRIPTS` - Concurrency limit (default: 3)
- `LLM_SCRIPT_TIMEOUT`, `LLM_GENERAL_TIMEOUT` - Request timeouts

## Dependencies
- **FastAPI 0.111.0** - Web framework
- **SQLAlchemy 2.0.30** - ORM with async support
- **asyncpg 0.29.0** - PostgreSQL async driver
- **aio-pika 9.4.1** - RabbitMQ async client
- **openai 1.30.0** - LLM client (compatible with Ollama)
- **Pydantic 2.7.1** - Data validation
- **pytest-asyncio 0.23.7** - Async test support
- **testcontainers[postgres]** - Integration testing

## Deployment
- **Port:** 8004
- **Health Check:** GET `/health` returns `{"status": "ok"}`
- **Metrics:** Prometheus metrics exposed at `/metrics`
- **Docker:** Multi-stage build with Python 3.12-slim

## Test Coverage
- 14 test cases covering:
  - Scoring algorithms (weighted sums, missing steps)
  - LLM response parsing and validation
  - Prompt generation and formatting
  - Message processing pipeline
  - Script screening (contextual applicability)
  - API endpoints (list, detail, stats, reanalyze)
  - Authorization and isolation

## Integration Points
- **transcription-service** (8003) - Fetch transcript segments
- **scripts-service** (8005) - Fetch applicable sales scripts
- **auth-service** (8001) - Verify JWT tokens
- **RabbitMQ** - Consume queue.analyze, publish queue.cache.invalidate
- **PostgreSQL 16** - Persist analytics in schema `analytics`
- **LLM Server (Ollama/OpenAI)** - Script and conversation analysis

## Files Summary
- **28 files total** | **1,893 lines of code**
- Core logic: 315 lines (app/)
- Worker: 267 lines (worker/)
- Tests: 750+ lines (tests/)
- Configuration: 150+ lines (alembic, config, main)

