# Multi-Agent Delegation System

The Multi-Agent Delegation System allows you to decompose complex software development tasks and execute them with multiple AI agents working in parallel. This powerful feature is optimized for AWS Bedrock and provides intelligent task planning, file scope isolation, and comprehensive progress tracking.

## Overview

The delegation system consists of three main components:

1. **Orchestrator** - Plans tasks and manages parallel execution
2. **Subtask Runner** - Executes individual subtasks with proper isolation
3. **File Scope Service** - Prevents conflicts through glob-based access control

## Key Features

### 🎯 Intelligent Task Planning
- Uses Claude 4 Sonnet for optimal task decomposition
- Multiple planning strategies (auto, files, skills, sequential, parallel)
- Considers available agents and file structure

### 🚀 Parallel Execution
- Execute up to 3 agents simultaneously (Bedrock optimized)
- Configurable concurrency limits
- Proper timeout and error handling

### 🔒 File Scope Isolation
- Glob-based file access restrictions
- Prevents agent conflicts by isolating file operations
- Cross-platform path normalization

### 📊 Real-time Monitoring
- Live progress updates with status table
- Event-driven UI with detailed logging
- Conflict detection and resolution

### 📈 Comprehensive Reporting
- Detailed execution artifacts
- Changeset tracking and file modification logs
- VS Code integration for viewing results

## Usage

### Basic Delegation

```bash
devx
> /delegate "add comprehensive unit tests" --agents=3
```

This will:
1. Analyze the task and create a plan with 3 subtasks
2. Execute the subtasks in parallel with up to 3 agents
3. Track file changes and detect conflicts
4. Generate a comprehensive report

### Advanced Options

```bash
> /delegate "refactor authentication module" \
    --agents=2 \
    --strategy=files \
    --globs="src/auth/**/*,test/auth/**/*" \
    --max-parallel=2 \
    --timeout=600 \
    --no-continue-on-failure
```

#### Parameters:

- `--agents=N` - Number of agents to use (default: 3)
- `--strategy=STRATEGY` - Planning strategy:
  - `auto` - Let planner decide (default)
  - `files` - Decompose by file/directory boundaries
  - `skills` - Decompose by required skills/agents
  - `sequential` - Create dependent tasks
  - `parallel` - Create fully independent tasks
- `--globs="pattern,..."` - File patterns to restrict agents to
- `--max-parallel=N` - Maximum concurrent subtasks (default: 3)
- `--timeout=SECONDS` - Timeout per subtask (default: 600)
- `--no-continue-on-failure` - Stop if any subtask fails

### Planning Strategies

#### Auto Strategy (Default)
Let the planner agent decide the best approach based on the task description and codebase structure.

```bash
> /delegate "optimize the search functionality" --strategy=auto
```

#### Files Strategy
Decompose tasks by file or directory boundaries, ideal for code organization tasks.

```bash
> /delegate "add TypeScript types to all modules" --strategy=files
```

#### Skills Strategy
Decompose by required skills or agent types, good for tasks requiring different expertise.

```bash
> /delegate "improve application security" --strategy=skills
```

#### Sequential Strategy
Create dependent tasks that must run in order.

```bash
> /delegate "implement feature X with tests and docs" --strategy=sequential
```

#### Parallel Strategy
Create fully independent tasks that can run simultaneously.

```bash
> /delegate "update all documentation files" --strategy=parallel
```

### File Scope Restrictions

Use glob patterns to restrict which files agents can access:

```bash
# Restrict to source files only
> /delegate "refactor utilities" --globs="src/**/*,!src/**/*.test.ts"

# Multiple patterns
> /delegate "update docs" --globs="docs/**/*,README.md,*.md"

# Exclude patterns (prefix with !)
> /delegate "clean up code" --globs="src/**/*,!node_modules/**/*,!dist/**/*"
```

## Viewing Results

### Report Command

```bash
# View latest execution summary
> /delegate report

# Open detailed artifacts in VS Code
> /delegate report --open
```

### Execution Artifacts

Each delegation creates artifacts in `.devx/delegate/` containing:

- `execution-report.json` - Complete execution data
- `summary.md` - Human-readable summary
- Individual subtask folders with:
  - `execution.json` - Subtask execution details
  - `changes.json` - File modifications
  - `summary.md` - Subtask summary

## Best Practices

### Task Descriptions

Write clear, specific task descriptions:

```bash
# Good
> /delegate "add unit tests for the user authentication service using Jest" --agents=2

# Better
> /delegate "add comprehensive unit tests for UserAuthService class covering login, logout, and password reset functionality using Jest framework" --agents=3
```

### File Scope Usage

Use file scopes to prevent conflicts and focus work:

```bash
# Good - restrict to specific module
> /delegate "refactor payment processing" --globs="src/payments/**/*"

# Better - include tests and exclude generated files
> /delegate "refactor payment processing" --globs="src/payments/**/*,test/payments/**/*,!**/*.generated.ts"
```

### Agent Count Selection

Choose agent count based on task complexity:

- **1-2 agents**: Simple, focused tasks
- **3-4 agents**: Complex tasks with multiple components
- **5+ agents**: Large-scale refactoring or comprehensive updates

### Strategy Selection

Choose strategy based on task type:

- **auto**: Most tasks, let AI decide
- **files**: Code organization, module updates
- **skills**: Tasks requiring different expertise
- **sequential**: Tasks with dependencies
- **parallel**: Independent, similar tasks

## Troubleshooting

### Common Issues

#### High Failure Rate
- Reduce agent count or complexity
- Use more specific file scopes
- Check task description clarity

#### Conflicts Between Agents
- Use more restrictive file globs
- Reduce parallelism with `--max-parallel`
- Choose `sequential` strategy for dependent tasks

#### Timeout Issues
- Increase timeout with `--timeout`
- Break task into smaller subtasks
- Check AWS Bedrock rate limits

#### Unexpected Results
- Review execution artifacts in VS Code
- Check individual subtask logs
- Verify file scope restrictions

### Debug Mode

Enable debug logging by setting environment variable:

```bash
export DEBUG=devx:delegation
devx
```

## Integration with Agent System

The delegation system works seamlessly with the Agent System:

```bash
# Create specialized agents
> /agent create test-writer
> /agent create doc-writer

# Use in delegation (agents will be automatically selected)
> /delegate "add tests and documentation" --agents=2
```

Agents with specific tool restrictions will be matched to appropriate subtasks automatically.

## Performance Considerations

### AWS Bedrock Optimization

The system is optimized for AWS Bedrock:

- Default max parallelism of 3 agents
- Intelligent retry logic with exponential backoff
- Rate limiting to prevent API throttling
- Token usage optimization

### Cost Management

- Use smaller agent counts for simple tasks
- Leverage file scopes to reduce context size
- Monitor execution reports for efficiency metrics
- Consider using Claude 3.5 Haiku for simple subtasks

## Examples

### Example 1: Test Coverage

```bash
> /delegate "achieve 90% test coverage for the user service module" \
    --agents=3 \
    --strategy=files \
    --globs="src/services/user/**/*,test/services/user/**/*"
```

### Example 2: Documentation Update

```bash
> /delegate "update all API documentation with current endpoints and examples" \
    --agents=2 \
    --strategy=parallel \
    --globs="docs/api/**/*,src/**/*.md"
```

### Example 3: Security Hardening

```bash
> /delegate "implement security best practices across authentication and authorization modules" \
    --agents=4 \
    --strategy=skills \
    --globs="src/auth/**/*,src/middleware/**/*" \
    --timeout=900
```

### Example 4: Code Refactoring

```bash
> /delegate "refactor legacy callback-based code to use async/await patterns" \
    --agents=3 \
    --strategy=files \
    --globs="src/**/*.js,!src/**/*.test.js,!node_modules/**/*"
```

## API Reference

### Planning Interface

```typescript
interface TaskPlan {
  title: string;
  subtasks: Subtask[];
  risks?: string[];
  notes?: string[];
  estimatedDuration?: number;
}

interface Subtask {
  id: string;
  goal: string;
  suggestedAgent?: string;
  fileGlobs?: string[];
  tools?: string[];
  model?: string;
  priority?: 'low' | 'medium' | 'high';
  estimatedDuration?: number;
}
```

### Execution Configuration

```typescript
interface ExecutionConfig {
  maxParallel?: number;
  baseDir?: string;
  globalFileScope?: string[];
  subtaskTimeout?: number;
  continueOnFailure?: boolean;
  plannerModel?: string;
}
```

### Results

```typescript
interface ExecutionReport {
  plan: TaskPlan;
  executions: SubtaskExecution[];
  status: 'completed' | 'partial' | 'failed';
  startTime: Date;
  endTime: Date;
  duration: number;
  aggregatedChangeset: Changeset;
  conflicts: FileConflict[];
  artifactsDir: string;
}
```

For more technical details, see the [source code](../../packages/core/src/services/) and [unit tests](../../packages/core/src/services/fileScope.test.ts).