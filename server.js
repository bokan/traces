const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3847;
const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects');

app.use(express.static(__dirname));

// Decode project folder name to path
function decodeProjectName(encoded) {
  return encoded.replace(/-/g, '/');
}

// Encode path to folder name
function encodeProjectName(projectPath) {
  return projectPath.replace(/\//g, '-');
}

// Parse JSONL file
function parseJsonl(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

// Extract summary from session messages
function extractSummary(messages) {
  // Look for summary message type
  const summaryMsg = messages.find(m => m.type === 'summary');
  if (summaryMsg?.summary) return summaryMsg.summary.slice(0, 200);

  // Fall back to first user message
  const firstUser = messages.find(m => m.type === 'user');
  if (firstUser?.message?.content) {
    const text = typeof firstUser.message.content === 'string'
      ? firstUser.message.content
      : firstUser.message.content[0]?.text || '';
    return text.slice(0, 200);
  }
  return 'No summary';
}

// Count subagents in a session
function countSubagents(projectDir, sessionId) {
  const subagentsDir = path.join(projectDir, 'subagents');
  if (!fs.existsSync(subagentsDir)) return 0;

  const files = fs.readdirSync(subagentsDir);
  // Subagent files related to this session would need matching
  // For now, return total count in subagents folder
  return files.filter(f => f.endsWith('.jsonl')).length;
}

// GET /api/projects - List all projects
app.get('/api/projects', (req, res) => {
  try {
    if (!fs.existsSync(CLAUDE_DIR)) {
      return res.json([]);
    }

    const folders = fs.readdirSync(CLAUDE_DIR)
      .filter(f => {
        const stat = fs.statSync(path.join(CLAUDE_DIR, f));
        return stat.isDirectory();
      })
      .map(folder => {
        const projectDir = path.join(CLAUDE_DIR, folder);
        // Find most recent session file
        let lastModified = new Date(0);
        try {
          const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
          files.forEach(f => {
            const stat = fs.statSync(path.join(projectDir, f));
            if (stat.mtime > lastModified) lastModified = stat.mtime;
          });
        } catch (e) {}

        return {
          id: folder,
          path: decodeProjectName(folder),
          name: decodeProjectName(folder).split('/').pop() || folder,
          lastModified
        };
      })
      .sort((a, b) => b.lastModified - a.lastModified);

    res.json(folders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id/sessions - List sessions for a project
app.get('/api/projects/:id/sessions', (req, res) => {
  try {
    const projectDir = path.join(CLAUDE_DIR, req.params.id);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const files = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('.'))
      .map(f => {
        const filePath = path.join(projectDir, f);
        const stat = fs.statSync(filePath);
        const messages = parseJsonl(filePath);

        return {
          id: f.replace('.jsonl', ''),
          filename: f,
          modified: stat.mtime,
          messageCount: messages.length,
          summary: extractSummary(messages),
          subagentCount: countSubagents(projectDir, f.replace('.jsonl', ''))
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:projectId/:sessionId - Get session messages
app.get('/api/sessions/:projectId/:sessionId', (req, res) => {
  try {
    const filePath = path.join(CLAUDE_DIR, req.params.projectId, `${req.params.sessionId}.jsonl`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const messages = parseJsonl(filePath);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:projectId/:sessionId/agents - List subagents
app.get('/api/sessions/:projectId/:sessionId/agents', (req, res) => {
  try {
    const projectDir = path.join(CLAUDE_DIR, req.params.projectId);
    const subagentsDir = path.join(projectDir, 'subagents');

    if (!fs.existsSync(subagentsDir)) {
      return res.json([]);
    }

    // Parse parent session to find Task tool calls
    const sessionPath = path.join(projectDir, `${req.params.sessionId}.jsonl`);
    const parentMessages = fs.existsSync(sessionPath) ? parseJsonl(sessionPath) : [];

    // Extract agent IDs from tool results
    const agentIds = new Set();
    parentMessages.forEach(msg => {
      if (msg.type === 'user' && msg.message?.content) {
        const content = Array.isArray(msg.message.content) ? msg.message.content : [];
        content.forEach(block => {
          if (block.type === 'tool_result' && block.content && typeof block.content === 'string') {
            const match = block.content.match(/agentId:\s*([a-f0-9-]+)/i);
            if (match) agentIds.add(match[1]);
          }
        });
      }
    });

    // List all subagent files and filter
    const files = fs.readdirSync(subagentsDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const agentId = f.replace('agent-', '').replace('.jsonl', '');
        const filePath = path.join(subagentsDir, f);
        const messages = parseJsonl(filePath);
        const stat = fs.statSync(filePath);

        return {
          id: agentId,
          filename: f,
          messageCount: messages.length,
          summary: extractSummary(messages),
          modified: stat.mtime
        };
      });

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sessions/:projectId/:sessionId/agents/:agentId - Get subagent messages
app.get('/api/sessions/:projectId/:sessionId/agents/:agentId', (req, res) => {
  try {
    const filePath = path.join(
      CLAUDE_DIR,
      req.params.projectId,
      'subagents',
      `agent-${req.params.agentId}.jsonl`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const messages = parseJsonl(filePath);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/search - Search across sessions
app.get('/api/search', (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase();
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const results = [];
    const projects = fs.readdirSync(CLAUDE_DIR);

    for (const project of projects) {
      const projectDir = path.join(CLAUDE_DIR, project);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const sessions = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl') && !f.startsWith('.'));

      for (const session of sessions) {
        const filePath = path.join(projectDir, session);
        const messages = parseJsonl(filePath);

        const matches = messages.filter(msg => {
          const text = JSON.stringify(msg).toLowerCase();
          return text.includes(query);
        });

        if (matches.length > 0) {
          results.push({
            projectId: project,
            projectPath: decodeProjectName(project),
            sessionId: session.replace('.jsonl', ''),
            matchCount: matches.length,
            summary: extractSummary(messages)
          });
        }

        if (results.length >= 50) break;
      }
      if (results.length >= 50) break;
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Traces server running at http://localhost:${PORT}`);
});
