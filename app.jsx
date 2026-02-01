// Traces - Claude Code History Viewer
// Note: dangerouslySetInnerHTML used for markdown rendering of local JSONL files (trusted data)

const { useState, useEffect, useRef } = React;

// API
const fetchJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// Utils
const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return `Today ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const formatMarkdown = (text) => {
  if (!text) return '';
  return typeof marked !== 'undefined' ? marked.parse(text) : text.replace(/\n/g, '<br>');
};

// Lucide icon component - render SVG directly for performance
const toPascalCase = (str) => str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');

function Icon({ name, size = 14, className = '' }) {
  const pascalName = toPascalCase(name);
  const icon = typeof lucide !== 'undefined' && lucide[pascalName];
  if (!icon) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {icon.map(([tag, attrs], i) => {
        if (tag === 'path') return <path key={i} d={attrs.d} />;
        if (tag === 'circle') return <circle key={i} cx={attrs.cx} cy={attrs.cy} r={attrs.r} />;
        if (tag === 'rect') return <rect key={i} x={attrs.x} y={attrs.y} width={attrs.width} height={attrs.height} rx={attrs.rx} />;
        if (tag === 'line') return <line key={i} x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2} />;
        if (tag === 'polyline') return <polyline key={i} points={attrs.points} />;
        if (tag === 'polygon') return <polygon key={i} points={attrs.points} />;
        return null;
      })}
    </svg>
  );
}

const TOOL_ICONS = {
  Bash: 'terminal',
  Read: 'file-text',
  Write: 'file-plus',
  Edit: 'pencil',
  Glob: 'folder-search',
  Grep: 'search',
  Task: 'bot',
  WebFetch: 'globe',
  WebSearch: 'search',
  default: 'wrench'
};

const getToolIcon = (name) => TOOL_ICONS[name] || TOOL_ICONS.default;

const getToolSummary = (tool) => {
  const input = tool.input || {};
  if (tool.name === 'Bash' && input.command) return input.command.slice(0, 50) + (input.command.length > 50 ? '…' : '');
  if (tool.name === 'Read' && input.file_path) return input.file_path.split('/').pop();
  if (tool.name === 'Write' && input.file_path) return input.file_path.split('/').pop();
  if (tool.name === 'Edit' && input.file_path) return input.file_path.split('/').pop();
  if (tool.name === 'Glob' && input.pattern) return input.pattern;
  if (tool.name === 'Grep' && input.pattern) return input.pattern;
  if (tool.name === 'Task' && input.description) return input.description;
  return '';
};

const formatToolInput = (tool) => {
  const input = tool.input || {};
  if (tool.name === 'Bash') return input.command || '';
  if (tool.name === 'Read') return input.file_path || '';
  if (tool.name === 'Write') return `${input.file_path}\n${'─'.repeat(40)}\n${(input.content || '').slice(0, 500)}${(input.content || '').length > 500 ? '\n…' : ''}`;
  if (tool.name === 'Edit') return `${input.file_path}\n${'─'.repeat(40)}\n- ${(input.old_string || '').slice(0, 200)}\n+ ${(input.new_string || '').slice(0, 200)}`;
  return JSON.stringify(input, null, 2);
};

// Format model name for display
const formatModel = (model) => {
  if (!model) return null;
  // claude-opus-4-5-20251101 -> Opus 4.5
  // claude-sonnet-4-20250514 -> Sonnet 4
  const match = model.match(/claude-(\w+)-(\d+)(?:-(\d+))?/);
  if (match) {
    const [, name, major, minor] = match;
    const version = minor ? `${major}.${minor}` : major;
    return `${name.charAt(0).toUpperCase() + name.slice(1)} ${version}`;
  }
  return model.replace('claude-', '').split('-')[0];
};

// Format token count
const formatTokens = (usage) => {
  if (!usage) return null;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cached = (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0);
  return { input, output, cached, total: input + output };
};

// Anthropic pricing (per 1M tokens)
const PRICING = {
  'opus': { input: 15, output: 75, cached: 1.5 },
  'sonnet': { input: 3, output: 15, cached: 0.3 },
  'haiku': { input: 0.25, output: 1.25, cached: 0.03 }
};

const estimateCost = (tokens, model) => {
  const tier = model?.includes('opus') ? 'opus' :
               model?.includes('haiku') ? 'haiku' : 'sonnet';
  const p = PRICING[tier];
  return (tokens.input * p.input + tokens.output * p.output + tokens.cached * p.cached) / 1_000_000;
};

const computeSessionStats = (messages, turns) => {
  // Duration
  const start = messages[0]?.timestamp ? new Date(messages[0].timestamp) : null;
  const end = messages[messages.length - 1]?.timestamp ? new Date(messages[messages.length - 1].timestamp) : null;
  const duration = start && end ? end - start : 0;

  // Token totals and model
  let tokens = { input: 0, output: 0, cached: 0 };
  let model = null;
  turns.forEach(t => {
    if (t.usage) {
      tokens.input += t.usage.input_tokens || 0;
      tokens.output += t.usage.output_tokens || 0;
      tokens.cached += (t.usage.cache_read_input_tokens || 0);
    }
    if (t.model && !model) model = t.model;
  });

  // Files accessed
  const files = { read: new Set(), write: new Set(), edit: new Set() };
  turns.forEach(t => {
    t.blocks?.filter(b => b.type === 'tool_use').forEach(b => {
      if (b.name === 'Read' && b.input?.file_path) files.read.add(b.input.file_path);
      if (b.name === 'Write' && b.input?.file_path) files.write.add(b.input.file_path);
      if (b.name === 'Edit' && b.input?.file_path) files.edit.add(b.input.file_path);
    });
  });

  // Tool counts
  const tools = {};
  turns.forEach(t => {
    t.blocks?.filter(b => b.type === 'tool_use').forEach(b => {
      tools[b.name] = (tools[b.name] || 0) + 1;
    });
  });

  const messageCount = turns.filter(t => t.type === 'user').length;
  const cost = estimateCost(tokens, model);

  return { duration, tokens, files, tools, messageCount, model, cost };
};

const formatDuration = (ms) => {
  if (!ms) return '-';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
};

// Process messages into turns
const processMessages = (rawMessages) => {
  const turns = [];
  const toolResults = new Map();

  rawMessages.forEach(msg => {
    if (msg.type === 'user' && Array.isArray(msg.message?.content)) {
      msg.message.content.forEach(block => {
        if (block.type === 'tool_result') toolResults.set(block.tool_use_id, block.content);
      });
    }
  });

  let currentTurn = null;
  rawMessages.forEach(msg => {
    if (msg.type === 'user') {
      const content = msg.message?.content;
      if (Array.isArray(content) && content.every(c => c.type === 'tool_result')) return;
      if (currentTurn) { turns.push(currentTurn); currentTurn = null; }
      turns.push({ type: 'user', content });
    } else if (msg.type === 'assistant') {
      const content = msg.message?.content;
      if (!content) return;
      if (!currentTurn) {
        currentTurn = {
          type: 'assistant',
          blocks: [],
          model: msg.message?.model,
          usage: null
        };
      }
      // Capture model from first message in turn
      if (!currentTurn.model && msg.message?.model) {
        currentTurn.model = msg.message.model;
      }
      // Accumulate usage (last one has final counts)
      if (msg.message?.usage) {
        currentTurn.usage = msg.message.usage;
      }
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content) }];
      blocks.forEach(block => {
        if (block.type === 'tool_use') {
          currentTurn.blocks.push({ ...block, result: toolResults.get(block.id) });
        } else {
          currentTurn.blocks.push(block);
        }
      });
    }
  });
  if (currentTurn) turns.push(currentTurn);
  return turns;
};

// Components
function ToolBlock({ tool }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border-subtle/60 overflow-hidden bg-surface-1/80">
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-surface-2/70 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-text-muted/50 text-[8px] w-2">{expanded ? '▼' : '▶'}</span>
        <Icon name={getToolIcon(tool.name)} size={13} className="text-text-muted/70" />
        <span className="text-[12px] font-medium text-text-primary/90">{tool.name}</span>
        <span className="text-[11px] text-text-muted/60 truncate flex-1 font-mono">{getToolSummary(tool)}</span>
      </div>
      {expanded && (
        <div className="border-t border-border-subtle/50">
          {tool.input && Object.keys(tool.input).length > 0 && (
            <div className="px-2.5 py-2 bg-surface-2/30">
              <div className="text-[9px] font-medium text-text-muted/50 uppercase tracking-wider mb-1">input</div>
              <pre className="text-[11px] text-text-secondary/90 font-mono whitespace-pre-wrap break-words leading-relaxed">{formatToolInput(tool)}</pre>
            </div>
          )}
          {tool.result && (
            <div className="px-2.5 py-2 bg-surface-0/30 border-t border-border-subtle/30">
              <div className="text-[9px] font-medium text-text-muted/50 uppercase tracking-wider mb-1">result</div>
              <pre className="text-[11px] text-text-muted/80 font-mono whitespace-pre-wrap break-words max-h-40 overflow-y-auto leading-relaxed scrollbar-thin">
                {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Collapsible({ title, icon, children, defaultCollapsed = true }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="text-text-muted">
      <button
        className="flex items-center gap-1.5 text-[11px] hover:text-text-secondary transition-colors opacity-70 hover:opacity-100"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[8px]">{collapsed ? '▶' : '▼'}</span>
        {icon && <span className="text-xs">{icon}</span>}
        <span>{title}</span>
      </button>
      {!collapsed && (
        <div className="mt-2 ml-4 pl-2.5 border-l border-border-subtle/50 text-text-muted/80 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function MarkdownContent({ text, className = '' }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: formatMarkdown(text) }} />;
}

function Avatar({ type }) {
  const isUser = type === 'user';
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 mt-0.5 ${
      isUser ? 'bg-blue-500/25 text-blue-400' : 'bg-purple-500/25 text-purple-400'
    }`}>
      {isUser ? 'U' : 'C'}
    </div>
  );
}

function UserMessage({ content, id }) {
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (!text.trim()) return null;

  return (
    <div id={id} className="message flex gap-3 py-4 px-4 bg-surface-2/50 rounded-lg">
      <Avatar type="user" />
      <div className="flex-1 min-w-0">
        <MarkdownContent text={text} className="text-text-primary prose prose-invert prose-sm max-w-none text-[14px] leading-relaxed" />
      </div>
    </div>
  );
}

function ModelBadge({ model }) {
  if (!model) return null;
  const name = formatModel(model);
  const colors = {
    'Opus': 'bg-purple-500/20 text-purple-400',
    'Sonnet': 'bg-blue-500/20 text-blue-400',
    'Haiku': 'bg-green-500/20 text-green-400',
  };
  const colorClass = Object.entries(colors).find(([k]) => name?.includes(k))?.[1] || 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${colorClass}`}>
      {name}
    </span>
  );
}

function TokenBadge({ usage }) {
  const tokens = formatTokens(usage);
  if (!tokens) return null;
  const fmt = (n) => n > 1000 ? `${(n / 1000).toFixed(1)}k` : n;
  const tooltip = `${tokens.input.toLocaleString()} in / ${tokens.output.toLocaleString()} out${tokens.cached > 0 ? ` / ${tokens.cached.toLocaleString()} cached` : ''}`;
  return (
    <span className="text-[10px] text-text-muted font-mono flex items-center gap-1.5" title={tooltip}>
      <span className="text-green-500/70" title="Input tokens">↓{fmt(tokens.input)}</span>
      <span className="text-blue-500/70" title="Output tokens">↑{fmt(tokens.output)}</span>
      {tokens.cached > 0 && <span className="text-amber-500/60" title="Cached tokens">⚡{fmt(tokens.cached)}</span>}
    </span>
  );
}

function AssistantMessage({ blocks, model, usage, id }) {
  const ref = useRef();
  const textParts = blocks.filter(b => b.type === 'text').map(b => b.text);
  const thinkingParts = blocks.filter(b => b.type === 'thinking').map(b => b.thinking);
  const toolParts = blocks.filter(b => b.type === 'tool_use');

  useEffect(() => {
    if (ref.current) ref.current.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }, [blocks]);

  return (
    <div id={id} className="message flex gap-3 py-4 px-4" ref={ref}>
      <Avatar type="assistant" />
      <div className="flex-1 min-w-0 space-y-3">
        {/* Model and token info */}
        {(model || usage) && (
          <div className="flex items-center gap-2 mb-1">
            <ModelBadge model={model} />
            <TokenBadge usage={usage} />
          </div>
        )}
        {thinkingParts.length > 0 && (
          <Collapsible title="Thinking" icon="💭">
            <MarkdownContent text={thinkingParts.join('\n\n')} className="text-[13px] text-text-secondary leading-relaxed" />
          </Collapsible>
        )}
        {textParts.length > 0 && (
          <MarkdownContent text={textParts.join('\n')} className="text-text-primary prose prose-invert max-w-none text-[14px] leading-relaxed [&_pre]:bg-surface-2 [&_pre]:rounded [&_pre]:p-3 [&_code]:text-[13px] [&_code]:font-mono" />
        )}
        {toolParts.length > 0 && (
          <div className="space-y-2 mt-3">
            {toolParts.map((tool, i) => <ToolBlock key={tool.id || i} tool={tool} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationWithSidebar({ messages, agents, onSelectAgent }) {
  const turns = React.useMemo(() => processMessages(messages), [messages]);
  const containerRef = useRef(null);

  const scrollToTurn = (index) => {
    const el = document.getElementById(`turn-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto scrollbar-thin" ref={containerRef}>
        <div className="max-w-4xl mx-auto px-6 py-5 space-y-5">
          {turns.map((turn, i) =>
            turn.type === 'user'
              ? <UserMessage key={i} content={turn.content} id={`turn-${i}`} />
              : <AssistantMessage key={i} blocks={turn.blocks} model={turn.model} usage={turn.usage} id={`turn-${i}`} />
          )}
        </div>
      </div>
      <RightSidebar
        messages={messages}
        turns={turns}
        agents={agents}
        onSelectAgent={onSelectAgent}
        onScrollToTurn={scrollToTurn}
      />
    </>
  );
}

function Sidebar({ projects, sessions, currentProject, onSelectProject, onSelectSession, onBack }) {
  const showSessions = currentProject && sessions;

  return (
    <aside className="w-72 flex-shrink-0 bg-surface-1 border-r border-border-subtle flex flex-col overflow-hidden">
      {!showSessions ? (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="px-4 py-3 border-b border-border-subtle sticky top-0 bg-surface-1/95 backdrop-blur-sm">
            <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Projects</h2>
          </div>
          <div className="py-1">
            {projects.map(p => (
              <div
                key={p.id}
                className="px-4 py-3 hover:bg-surface-2 cursor-pointer transition-colors border-l-2 border-transparent hover:border-accent-blue group"
                onClick={() => onSelectProject(p.id)}
                title={p.path}
              >
                <div className="font-medium text-[14px] text-text-primary truncate group-hover:text-white">{p.name}</div>
                <div className="text-[11px] text-text-muted truncate mt-1 font-mono" title={p.path}>{p.path}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between sticky top-0 bg-surface-1/95 backdrop-blur-sm z-10">
            <h2 className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">Sessions</h2>
            <button className="text-[12px] text-accent-blue hover:text-white transition-colors font-medium" onClick={onBack}>← Back</button>
          </div>
          <div className="py-1">
            {sessions.map(s => (
              <div
                key={s.id}
                className="px-4 py-3 hover:bg-surface-2 cursor-pointer transition-colors border-l-2 border-transparent hover:border-accent-purple group"
                onClick={() => onSelectSession(s.id)}
                title={s.summary}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] text-text-muted font-mono">{formatDate(s.modified)}</span>
                  <span className="text-[11px] text-text-muted font-mono ml-auto bg-surface-2 px-2 py-0.5 rounded">{s.messageCount} msgs</span>
                </div>
                <div className="text-[13px] text-text-secondary line-clamp-2 leading-relaxed group-hover:text-text-primary" title={s.summary}>{s.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

// Right Sidebar Section Components
function SidebarSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border-subtle/60">
      <button
        className="w-full px-3 py-3 flex items-center justify-between hover:bg-surface-2/50 transition-colors sticky top-0 bg-surface-1 z-[1]"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[12px] font-semibold text-text-secondary uppercase tracking-wide">{title}</span>
        <span className="text-[10px] text-text-muted">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function StatsSection({ stats }) {
  const fmt = (n) => n > 1000 ? `${(n / 1000).toFixed(1)}k` : n;
  const tokenTooltip = `${stats.tokens.input.toLocaleString()} in / ${stats.tokens.output.toLocaleString()} out${stats.tokens.cached > 0 ? ` / ${stats.tokens.cached.toLocaleString()} cached` : ''}`;
  return (
    <SidebarSection title="Stats" defaultOpen={true}>
      <div className="bg-surface-2 rounded-md p-3 space-y-2.5 text-[12px] font-mono border border-border-subtle">
        <div className="flex justify-between items-center">
          <span className="text-text-muted font-sans text-[11px]">Cost</span>
          <span className="text-text-primary font-semibold text-[13px]">${stats.cost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center" title={tokenTooltip}>
          <span className="text-text-muted font-sans text-[11px]">Tokens</span>
          <span className="flex gap-1.5">
            <span className="text-green-500" title="Input">↓{fmt(stats.tokens.input)}</span>
            <span className="text-blue-500" title="Output">↑{fmt(stats.tokens.output)}</span>
            {stats.tokens.cached > 0 && <span className="text-amber-500" title="Cached">⚡{fmt(stats.tokens.cached)}</span>}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-muted font-sans text-[11px]">Messages</span>
          <span className="text-text-secondary">{stats.messageCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-text-muted font-sans text-[11px]">Duration</span>
          <span className="text-text-secondary">{formatDuration(stats.duration)}</span>
        </div>
      </div>
    </SidebarSection>
  );
}

function TOCSection({ turns, onScrollTo }) {
  const userTurns = turns.map((t, i) => ({ ...t, index: i })).filter(t => t.type === 'user');
  const getText = (content) => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.filter(c => c.type === 'text').map(c => c.text).join(' ');
    return '';
  };

  return (
    <SidebarSection title="Table of Contents">
      <div className="space-y-0.5 max-h-48 overflow-y-auto scrollbar-thin">
        {userTurns.map((t, i) => (
          <div
            key={i}
            className="text-[10px] text-text-muted truncate cursor-pointer hover:text-text-primary transition-colors py-1 px-1.5 rounded hover:bg-surface-2/50"
            onClick={() => onScrollTo(t.index)}
            title={getText(t.content)}
          >
            {getText(t.content).slice(0, 40) || '(empty)'}
          </div>
        ))}
      </div>
    </SidebarSection>
  );
}

function FilesSection({ files }) {
  const hasFiles = files.read.size > 0 || files.write.size > 0 || files.edit.size > 0;
  if (!hasFiles) return null;

  const FileList = ({ icon, label, paths }) => {
    if (paths.size === 0) return null;
    const [expanded, setExpanded] = useState(false);
    const arr = Array.from(paths);
    return (
      <div className="mb-1.5">
        <div
          className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:text-text-primary transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-[8px] text-text-muted/50">{expanded ? '▼' : '▶'}</span>
          <Icon name={icon} size={12} className="text-text-muted/60" />
          <span className="text-text-muted/70">{label}</span>
          <span className="text-text-muted/50 ml-auto">{paths.size}</span>
        </div>
        {expanded && (
          <div className="ml-4 mt-1 space-y-0.5">
            {arr.map((p, i) => (
              <div key={i} className="text-[10px] text-text-muted/60 font-mono truncate" title={p}>
                {p.split('/').pop()}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <SidebarSection title="Files Accessed">
      <FileList icon="file-text" label="Read" paths={files.read} />
      <FileList icon="pencil" label="Edit" paths={files.edit} />
      <FileList icon="file-plus" label="Write" paths={files.write} />
    </SidebarSection>
  );
}

function AgentsSection({ agents, onSelect }) {
  if (!agents || agents.length === 0) return null;

  return (
    <SidebarSection title="Sub-agents">
      <div className="space-y-0.5 max-h-32 overflow-y-auto scrollbar-thin">
        {agents.map(a => (
          <div
            key={a.id}
            className="flex items-center gap-1.5 text-[10px] cursor-pointer hover:text-text-primary transition-colors py-1 px-1.5 rounded hover:bg-surface-2/50"
            onClick={() => onSelect(a.id)}
            style={{ paddingLeft: (a.depth || 0) * 8 + 6 }}
            title={a.summary || 'Agent'}
          >
            <Icon name="bot" size={12} className="text-text-muted/70" />
            <span className="text-text-muted truncate">{a.summary?.slice(0, 35) || 'Agent'}</span>
          </div>
        ))}
      </div>
    </SidebarSection>
  );
}

function TimelineSection({ turns, onScrollTo }) {
  const tokenCounts = turns.map(t => {
    if (!t.usage) return 0;
    return (t.usage.input_tokens || 0) + (t.usage.output_tokens || 0);
  });
  const maxTokens = Math.max(...tokenCounts, 1);

  return (
    <SidebarSection title="Timeline">
      <div className="space-y-2">
        <div className="flex h-6 gap-px rounded overflow-hidden bg-surface-0/50">
          {turns.map((t, i) => {
            const intensity = tokenCounts[i] / maxTokens;
            const opacity = 0.2 + intensity * 0.8;
            const hasThinking = t.blocks?.some(b => b.type === 'thinking');
            const hasTool = t.blocks?.some(b => b.type === 'tool_use');
            return (
              <div
                key={i}
                className="flex-1 cursor-pointer hover:brightness-125 transition-all"
                style={{
                  backgroundColor: t.type === 'user' ? `rgba(59, 130, 246, ${opacity})` :
                    hasThinking ? `rgba(245, 158, 11, ${opacity})` :
                    hasTool ? `rgba(34, 197, 94, ${opacity})` :
                    `rgba(168, 85, 247, ${opacity})`,
                  minWidth: 2
                }}
                onClick={() => onScrollTo(i)}
                title={`Turn ${i + 1}: ${tokenCounts[i].toLocaleString()} tokens`}
              />
            );
          })}
        </div>
        <div className="flex gap-3 text-[9px] text-text-muted">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/60"></span>user</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-purple-500/60"></span>assistant</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/60"></span>tool</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/60"></span>thinking</span>
        </div>
      </div>
    </SidebarSection>
  );
}

function ToolsSection({ tools }) {
  const entries = Object.entries(tools).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <SidebarSection title="Tools Used">
      <div className="flex flex-wrap gap-2 text-[10px] font-mono">
        {entries.map(([name, count]) => (
          <span key={name} className="text-text-muted flex items-center gap-1 bg-surface-2/50 px-1.5 py-0.5 rounded" title={`${name}: ${count} calls`}>
            <Icon name={getToolIcon(name)} size={11} className="text-text-muted/70" />
            <span className="text-text-secondary">{name}</span>
            <span className="text-text-muted/70">{count}</span>
          </span>
        ))}
      </div>
    </SidebarSection>
  );
}

function RightSidebar({ messages, turns, agents, onSelectAgent, onScrollToTurn }) {
  const stats = React.useMemo(() => computeSessionStats(messages, turns), [messages, turns]);

  return (
    <aside className="w-60 flex-shrink-0 bg-surface-1 border-l border-border-subtle flex flex-col overflow-y-auto scrollbar-thin">
      <StatsSection stats={stats} />
      <TOCSection turns={turns} onScrollTo={onScrollToTurn} />
      <FilesSection files={stats.files} />
      <AgentsSection agents={agents} onSelect={onSelectAgent} />
      <TimelineSection turns={turns} onScrollTo={onScrollToTurn} />
      <ToolsSection tools={stats.tools} />
    </aside>
  );
}

function App() {
  const [projects, setProjects] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [agents, setAgents] = useState(null);
  const [messages, setMessages] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentSession, setCurrentSession] = useState(null);
  const [currentAgent, setCurrentAgent] = useState(null);

  // Parse hash: #/project/session/agent
  const parseHash = () => {
    const hash = window.location.hash.slice(2); // remove #/
    const [project, session, agent] = hash.split('/');
    return { project: project || null, session: session || null, agent: agent || null };
  };

  // Update hash when state changes
  const updateHash = (project, session, agent) => {
    const parts = [project, session, agent].filter(Boolean);
    window.location.hash = parts.length ? '/' + parts.join('/') : '';
  };

  // Load from hash on mount
  useEffect(() => {
    fetchJson('/api/projects').then(async (projs) => {
      setProjects(projs);
      const { project, session, agent } = parseHash();
      if (project) {
        setCurrentProject(project);
        const sessData = await fetchJson(`/api/projects/${project}/sessions`);
        setSessions(sessData);
        if (session) {
          setCurrentSession(session);
          const [msgs, agts] = await Promise.all([
            fetchJson(`/api/sessions/${project}/${session}`),
            fetchJson(`/api/sessions/${project}/${session}/agents`)
          ]);
          setMessages(msgs);
          setAgents(agts);
          if (agent) {
            setCurrentAgent(agent);
            const agentMsgs = await fetchJson(`/api/sessions/${project}/${session}/agents/${agent}`);
            setMessages(agentMsgs);
          }
        }
      }
    });
  }, []);

  const selectProject = async (id) => {
    setCurrentProject(id);
    setCurrentSession(null);
    setCurrentAgent(null);
    setMessages(null);
    setAgents(null);
    updateHash(id, null, null);
    const data = await fetchJson(`/api/projects/${id}/sessions`);
    setSessions(data);
  };

  const selectSession = async (id) => {
    setCurrentSession(id);
    setCurrentAgent(null);
    updateHash(currentProject, id, null);
    const [msgs, agts] = await Promise.all([
      fetchJson(`/api/sessions/${currentProject}/${id}`),
      fetchJson(`/api/sessions/${currentProject}/${id}/agents`)
    ]);
    setMessages(msgs);
    setAgents(agts);
  };

  const selectAgent = async (id) => {
    setCurrentAgent(id);
    updateHash(currentProject, currentSession, id);
    const msgs = await fetchJson(`/api/sessions/${currentProject}/${currentSession}/agents/${id}`);
    setMessages(msgs);
  };

  const goBack = () => {
    setCurrentProject(null);
    setSessions(null);
    setAgents(null);
    setMessages(null);
    updateHash(null, null, null);
  };

  const breadcrumb = [
    currentProject && currentProject.split('-').pop(),
    currentSession && currentSession.slice(0, 8),
    currentAgent && `agent-${currentAgent.slice(0, 8)}`
  ].filter(Boolean).join(' / ');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <header className="flex-shrink-0 bg-surface-1 border-b border-border-subtle px-4 py-2.5 flex items-center gap-3">
        <h1 className="text-[15px] font-semibold text-text-primary tracking-tight">Traces</h1>
        <div className="flex-1" />
        {breadcrumb && (
          <div className="text-[12px] text-text-muted font-mono">{breadcrumb}</div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          projects={projects}
          sessions={sessions}
          currentProject={currentProject}
          onSelectProject={selectProject}
          onSelectSession={selectSession}
          onBack={goBack}
        />

        <main className="flex-1 flex overflow-hidden bg-surface-0">
          {messages ? (
            <ConversationWithSidebar
              messages={messages}
              agents={agents}
              onSelectAgent={selectAgent}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4 opacity-10">📜</div>
                <p className="text-sm text-text-muted/70">Select a project</p>
                <p className="text-xs text-text-muted/40 mt-1">Browse your Claude Code conversations</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
