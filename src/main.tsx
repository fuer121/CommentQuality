import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  RefreshCw,
  Save,
  Settings,
  SlidersHorizontal,
  UploadCloud,
} from 'lucide-react';
import './styles.css';
import { filterTaskRows, type CommentTypeFilter } from './task-row-filters';

type CommentType = '书评' | '章评' | '段评';
type PromptVersion = 'V1' | 'V2';
type TaskStatus = 'created' | 'running' | 'paused' | 'completed' | 'completed_with_errors' | 'failed';
type RowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'invalid';

interface MappingRule {
  label: string;
  min: number;
  max: number;
  includeMax: boolean;
}

interface AppConfig {
  promptVersion: PromptVersion;
  prompts: {
    bookReview: string;
    chapterComment: string;
    paragraphComment: string;
  };
  promptVersions: Record<PromptVersion, AppConfig['prompts']>;
  qualityRules: MappingRule[];
  emotionRules: MappingRule[];
  updatedAt: string;
}

interface TaskSummary {
  id: string;
  name: string;
  fileName: string;
  status: TaskStatus;
  totalRows: number;
  validRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
}

interface ScoreResult {
  comment_type: string;
  quality_score: number;
  quality_level: string;
  quality_reason: string;
  emotion_score: number;
  emotion_type: string;
}

interface TaskRow {
  id: string;
  rowNumber: number;
  comment_type: string;
  comment_content: string;
  status: RowStatus;
  error?: string;
  result?: ScoreResult;
}

interface ScoreTask extends TaskSummary {
  rows: TaskRow[];
}

interface Health {
  ok: boolean;
  dify: { configured: boolean; baseUrl: string };
  storage: string;
}

const promptTabs: Array<{ key: keyof AppConfig['prompts']; label: string }> = [
  { key: 'bookReview', label: '书评 Prompt' },
  { key: 'chapterComment', label: '章评 Prompt' },
  { key: 'paragraphComment', label: '段评 Prompt' },
];

function api<T>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, options).then(async (response) => {
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(typeof body === 'string' ? body : body.error || body.message || '请求失败');
    }
    return body as T;
  });
}

function statusLabel(status: TaskStatus | RowStatus) {
  const labels: Record<string, string> = {
    created: '待处理',
    running: '运行中',
    paused: '已暂停',
    completed: '已完成',
    completed_with_errors: '部分失败',
    failed: '失败',
    pending: '待处理',
    invalid: '无效',
  };
  return labels[status] || status;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function classForLevel(level?: string) {
  if (level === '好' || level === '正向') return 'good';
  if (level === '中' || level === '中性') return 'mid';
  if (level === '差' || level === '负向') return 'bad';
  return 'neutral';
}

function classForStatus(status: TaskStatus | RowStatus) {
  if (status === 'failed' || status === 'invalid' || status === 'completed_with_errors') return 'bad';
  if (status === 'running' || status === 'paused') return 'mid';
  if (status === 'completed') return 'good';
  return 'neutral';
}

function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selectedTask, setSelectedTask] = useState<ScoreTask | null>(null);
  const [activePrompt, setActivePrompt] = useState<keyof AppConfig['prompts']>('bookReview');
  const [activeNav, setActiveNav] = useState('tasks');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [commentTypeFilter, setCommentTypeFilter] = useState<CommentTypeFilter>('全部');
  const fileInput = useRef<HTMLInputElement | null>(null);

  async function refresh(options: { includeConfig?: boolean } = {}) {
    const includeConfig = options.includeConfig ?? true;
    const [healthData, configData, taskData] = await Promise.all([
      api<Health>('/api/health'),
      includeConfig ? api<AppConfig>('/api/config') : Promise.resolve(null),
      api<TaskSummary[]>('/api/tasks'),
    ]);
    setHealth(healthData);
    if (configData) setConfig(configData);
    setTasks(taskData);
    const nextTaskId = selectedTask && taskData.some((task) => task.id === selectedTask.id) ? selectedTask.id : taskData[0]?.id;
    if (nextTaskId) {
      setSelectedTask(await api<ScoreTask>(`/api/tasks/${nextTaskId}`));
    } else {
      setSelectedTask(null);
    }
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const hasRunningTask = selectedTask?.status === 'running' || tasks.some((task) => task.status === 'running');
    if (!hasRunningTask) return;

    const timer = window.setInterval(() => {
      refresh({ includeConfig: false }).catch((error) => setMessage(error.message));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedTask?.id, selectedTask?.status, tasks]);

  async function uploadFile(file: File) {
    setBusy('upload');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', file.name.replace(/\.[^.]+$/, ''));
      const task = await api<ScoreTask>('/api/tasks/upload', { method: 'POST', body: form });
      setSelectedTask(task);
      await refresh();
      setMessage(`已导入 ${task.totalRows} 行，${task.validRows} 行有效`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入失败');
    } finally {
      setBusy('');
    }
  }

  async function runTask(mode: 'all' | 'failed' = 'all') {
    if (!selectedTask) return;
    setBusy('run');
    setSelectedTask({ ...selectedTask, status: 'running' });
    setMessage('正在调用 Dify 工作流跑分...');
    try {
      const task = await api<ScoreTask>(`/api/tasks/${selectedTask.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      setSelectedTask(task);
      await refresh();
      setMessage(task.status === 'paused' ? '任务已暂停' : '跑分完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '跑分失败');
    } finally {
      setBusy('');
    }
  }

  async function pauseTask() {
    if (!selectedTask) return;
    setBusy('pause');
    try {
      const task = await api<ScoreTask>(`/api/tasks/${selectedTask.id}/pause`, { method: 'POST' });
      setSelectedTask(task);
      await refresh();
      setMessage('任务已暂停，将在当前评论处理完成后停止继续跑分');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '暂停失败');
    } finally {
      setBusy('');
    }
  }

  async function continueTask() {
    if (!selectedTask) return;
    setBusy('run');
    setSelectedTask({ ...selectedTask, status: 'running' });
    setMessage('正在继续跑分...');
    try {
      const task = await api<ScoreTask>(`/api/tasks/${selectedTask.id}/continue`, { method: 'POST' });
      setSelectedTask(task);
      await refresh();
      setMessage(task.status === 'paused' ? '任务已暂停' : '跑分完成');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '继续失败');
    } finally {
      setBusy('');
    }
  }

  async function saveConfig() {
    if (!config) return;
    setBusy('save');
    try {
      const saved = await api<AppConfig>('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setConfig(saved);
      setMessage('配置已保存到本地');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function injectConfig() {
    setBusy('inject');
    try {
      await api('/api/config/inject', { method: 'POST' });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '线上注入失败');
    } finally {
      setBusy('');
    }
  }

  const rows = useMemo(() => {
    return filterTaskRows(selectedTask?.rows ?? [], {
      query,
      commentType: commentTypeFilter,
    });
  }, [selectedTask, query, commentTypeFilter]);

  const activeTaskId = selectedTask?.id;
  const canPause = selectedTask?.status === 'running';
  const canContinue = selectedTask?.status === 'paused';
  const activePrompts = config?.promptVersions?.[config.promptVersion] ?? config?.prompts;

  function updatePromptVersion(promptVersion: PromptVersion) {
    if (!config) return;
    const promptVersions = config.promptVersions ?? { V1: config.prompts, V2: config.prompts };
    setConfig({ ...config, promptVersion, promptVersions, prompts: promptVersions[promptVersion] });
  }

  function updatePromptText(value: string) {
    if (!config) return;
    const promptVersions = config.promptVersions ?? { V1: config.prompts, V2: config.prompts };
    const nextPromptVersions = {
      ...promptVersions,
      [config.promptVersion]: {
        ...promptVersions[config.promptVersion],
        [activePrompt]: value,
      },
    };
    setConfig({ ...config, promptVersions: nextPromptVersions, prompts: nextPromptVersions[config.promptVersion] });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><MessageSquareText size={20} /></div>
          <strong>评论质量打分控制台</strong>
        </div>
        {[
          ['tasks', ClipboardList, '任务管理'],
          ['prompts', MessageSquareText, 'Prompt 管理'],
          ['mapping', SlidersHorizontal, '映射规则'],
          ['logs', BarChart3, '运行日志'],
        ].map(([key, Icon, label]) => (
          <button key={key as string} className={`nav-item ${activeNav === key ? 'active' : ''}`} onClick={() => setActiveNav(key as string)}>
            {React.createElement(Icon as typeof ClipboardList, { size: 18 })}
            {label as string}
          </button>
        ))}
        <button className="collapse-button" type="button">收起侧边栏</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>评论质量打分控制台</h1>
            <p>导入 Excel 评论，调用 Dify 工作流输出质量与情绪结构化结果。</p>
          </div>
          <div className="status-row">
            <span className={`status-chip ${health?.dify.configured ? 'ok' : 'warn'}`}>
              <span />
              Dify 连接 {health?.dify.configured ? '已配置' : '未配置'}
            </span>
            <span className="status-chip ok"><span />本地存储 正常</span>
            <Settings size={18} />
          </div>
        </header>

        <div className="content-grid">
          <section className="left-column">
            <div
              className="upload-card"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) uploadFile(file);
              }}
            >
              <div className="upload-zone" onClick={() => fileInput.current?.click()}>
                <UploadCloud size={42} />
                <strong>拖拽 Excel 文件到此处</strong>
                <span>支持 .xlsx/.xls，字段为 comment_type/comment_content 或 评论类型/评论内容</span>
              </div>
              <input ref={fileInput} hidden type="file" accept=".xlsx,.xls" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadFile(file);
              }} />
              <button className="primary-button" disabled={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                {busy === 'upload' ? <Loader2 className="spin" size={16} /> : <FileSpreadsheet size={16} />}
                导入文件
              </button>
            </div>

            <section className="panel">
              <div className="panel-title">
                <h2>任务列表</h2>
                <button className="icon-button" onClick={() => refresh()}><RefreshCw size={16} /></button>
              </div>
              <div className="task-table">
                <table>
                  <thead>
                    <tr><th>任务名</th><th>文件名</th><th>进度</th><th>状态</th><th>创建时间</th></tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className={activeTaskId === task.id ? 'selected' : ''} onClick={async () => setSelectedTask(await api<ScoreTask>(`/api/tasks/${task.id}`))}>
                        <td>{task.name}</td>
                        <td>{task.fileName}</td>
                        <td>{task.successRows}/{task.validRows}</td>
                        <td><span className={`pill ${classForStatus(task.status)}`}>{statusLabel(task.status)}</span></td>
                        <td>{formatDate(task.createdAt)}</td>
                      </tr>
                    ))}
                    {!tasks.length && <tr><td colSpan={5} className="empty">还没有任务，先导入一个 Excel 文件。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel result-panel">
              <div className="panel-title">
                <div>
                  <h2>任务详情</h2>
                  {selectedTask && <p>总数 {selectedTask.totalRows}，成功 {selectedTask.successRows}，失败 {selectedTask.failedRows}</p>}
                </div>
                <div className="action-row">
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索评论内容" />
                  <select value={commentTypeFilter} onChange={(event) => setCommentTypeFilter(event.target.value as CommentTypeFilter)}>
                    <option value="全部">全部类型</option>
                    <option value="书评">书评</option>
                    <option value="章评">章评</option>
                    <option value="段评">段评</option>
                  </select>
                  <button className="secondary-button" disabled={!selectedTask || busy === 'run' || canPause || canContinue} onClick={() => runTask('failed')}>重跑失败</button>
                  <button className="secondary-button" disabled={!canPause || busy === 'pause'} onClick={pauseTask}>
                    {busy === 'pause' ? <Loader2 className="spin" size={16} /> : <Pause size={16} />}
                    暂停
                  </button>
                  <button className="secondary-button" disabled={!canContinue || busy === 'run'} onClick={continueTask}>
                    <Play size={16} />
                    继续
                  </button>
                  <button className="primary-button" disabled={!selectedTask || busy === 'run' || canPause || canContinue} onClick={() => runTask('all')}>
                    {busy === 'run' ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                    开始跑分
                  </button>
                  <a className={`secondary-button ${!selectedTask ? 'disabled' : ''}`} href={selectedTask ? `/api/tasks/${selectedTask.id}/export` : undefined}>
                    <Download size={16} />导出
                  </a>
                </div>
              </div>
              <div className="result-table">
                <table>
                  <thead>
                    <tr>
                      <th>评论类型</th><th>评论内容</th><th>质量分</th><th>质量等级</th><th>情绪分</th><th>情绪类型</th><th>状态</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.comment_type || '-'}</td>
                        <td className="comment-cell" title={row.comment_content}>{row.comment_content || row.error}</td>
                        <td>{row.result?.quality_score ?? '-'}</td>
                        <td><span className={`pill ${classForLevel(row.result?.quality_level)}`}>{row.result?.quality_level ?? '-'}</span></td>
                        <td>{row.result?.emotion_score ?? '-'}</td>
                        <td><span className={`pill ${classForLevel(row.result?.emotion_type)}`}>{row.result?.emotion_type ?? '-'}</span></td>
                        <td><span className={`pill ${classForStatus(row.status)}`}>{statusLabel(row.status)}</span></td>
                        <td><button className="mini-button" title={row.result?.quality_reason || row.error}>详情</button></td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={8} className="empty">暂无明细。</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <aside className="inspector">
            {config && (
              <>
                <div className="version-row">
                  <label>
                    <span>提示词版本配置</span>
                    <select value={config.promptVersion} onChange={(event) => updatePromptVersion(event.target.value as PromptVersion)}>
                      <option value="V1">V1 线上当前版</option>
                      <option value="V2">V2 误放收紧版</option>
                    </select>
                  </label>
                </div>
                <div className="tabs">
                  {promptTabs.map((tab) => (
                    <button key={tab.key} className={activePrompt === tab.key ? 'active' : ''} onClick={() => setActivePrompt(tab.key)}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                <label className="field-label">提示词编辑</label>
                <p className="field-hint">当前线上跑分请求固定发送 prompt_version=V1；V2 仅用于本地 Prompt 管理和后续灰度参考。</p>
                <textarea
                  value={activePrompts?.[activePrompt] ?? ''}
                  onChange={(event) => updatePromptText(event.target.value)}
                />
                <div className="inspector-actions">
                  <button className="primary-button" onClick={saveConfig} disabled={busy === 'save'}><Save size={16} />保存提示词</button>
                  <button className="secondary-button" onClick={injectConfig} disabled={busy === 'inject'}>注入线上</button>
                </div>

                <MappingEditor
                  title="quality_score -> quality_level"
                  rules={config.qualityRules}
                  onChange={(qualityRules) => setConfig({ ...config, qualityRules })}
                />
                <MappingEditor
                  title="emotion_score -> emotion_type"
                  rules={config.emotionRules}
                  onChange={(emotionRules) => setConfig({ ...config, emotionRules })}
                />
              </>
            )}
          </aside>
        </div>
        {message && <div className="toast"><CheckCircle2 size={16} />{message}</div>}
      </section>
    </main>
  );
}

function MappingEditor({ title, rules, onChange }: {
  title: string;
  rules: MappingRule[];
  onChange: (rules: MappingRule[]) => void;
}) {
  return (
    <section className="mapping-card">
      <div className="mapping-head">
        <h3>{title}</h3>
        <button className="icon-button" onClick={() => onChange([...rules, { label: '新等级', min: 0, max: 0, includeMax: false }])}>+</button>
      </div>
      <div className="mapping-grid header"><span>最小值</span><span>最大值</span><span>标签</span></div>
      {rules.map((rule, index) => (
        <div className="mapping-grid" key={`${rule.label}-${index}`}>
          <input type="number" value={rule.min} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, min: Number(event.target.value) };
            onChange(next);
          }} />
          <input type="number" value={rule.max} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, max: Number(event.target.value) };
            onChange(next);
          }} />
          <input value={rule.label} onChange={(event) => {
            const next = [...rules];
            next[index] = { ...rule, label: event.target.value };
            onChange(next);
          }} />
        </div>
      ))}
    </section>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
